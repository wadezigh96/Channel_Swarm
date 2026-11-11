import { randomUUID } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { PayPalClient, type PayPalOrder } from "../src/paypal/paypal-client.js";
import { PayPalOrderLedger, type PayPalOrderRecord } from "../src/paypal/order-ledger.js";

const ORDER_ID_PATTERN = /^[A-Z0-9-]{8,64}$/i;

function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
  return (req.headers["x-real-ip"] as string | undefined) || first?.trim() || "unknown";
}

function captureId(order: PayPalOrder): string | undefined {
  return order.purchase_units?.flatMap((unit) => unit.payments?.captures || [])[0]?.id;
}

function buildRecord(order: PayPalOrder, amount: string, description: string, existing?: PayPalOrderRecord): PayPalOrderRecord {
  const capture = captureId(order);
  return {
    orderId: order.id,
    status: order.status,
    amount,
    currency: "USD",
    description,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...(capture ? { captureId: capture } : existing?.captureId ? { captureId: existing.captureId } : {}),
  };
}

function bodyOf(req: VercelRequest): Record<string, unknown> {
  if (req.body && typeof req.body === "object") return req.body as Record<string, unknown>;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body) as Record<string, unknown>; } catch { return {}; }
  }
  return {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const ledger = new PayPalOrderLedger();
  if (!ledger.isPersistentStoreConfigured()) {
    return res.status(503).json({ error: "Configure Upstash REST URL and token for a durable order ledger." });
  }

  if (req.method === "GET") {
    const orderId = String(req.query.orderId || "");
    if (!ORDER_ID_PATTERN.test(orderId)) return res.status(400).json({ error: "A valid orderId is required." });
    try {
      const record = await ledger.getOrder(orderId);
      if (!record) return res.status(404).json({ error: "Order was not found in this application's ledger." });
      return res.status(200).json({ success: true, order: record });
    } catch {
      return res.status(503).json({ error: "Order ledger is temporarily unavailable." });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const body = bodyOf(req);
  let client: PayPalClient;
  try {
    client = new PayPalClient();
  } catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : "PayPal is not configured." });
  }
  if (!client.isConfigured()) {
    return res.status(503).json({ error: "Set PayPal client credentials in the server environment." });
  }

  try {
    if (body.action === "capture") {
      const orderId = String(body.orderId || "");
      if (!ORDER_ID_PATTERN.test(orderId)) return res.status(400).json({ error: "A valid orderId is required." });
      const existing = await ledger.getOrder(orderId);
      if (!existing) return res.status(404).json({ error: "Order was not found in this application's ledger." });
      if (existing.status === "COMPLETED") {
        return res.status(200).json({ success: true, order: existing, alreadyCaptured: true });
      }
      const providerOrder = await client.getOrder(orderId);
      const amount = providerOrder.purchase_units?.[0]?.amount;
      if (amount?.currency_code !== existing.currency || amount.value !== existing.amount) {
        return res.status(409).json({ error: "The approved PayPal amount does not match the recorded order." });
      }
      if (providerOrder.status === "COMPLETED") {
        const record = buildRecord(providerOrder, existing.amount, existing.description, existing);
        await ledger.putOrder(record);
        return res.status(200).json({ success: true, order: record, alreadyCaptured: true });
      }
      if (providerOrder.status !== "APPROVED") {
        return res.status(409).json({ error: "Approve the order in PayPal before capture." });
      }
      const captured = await client.captureOrder(orderId);
      const record = buildRecord(captured, existing.amount, existing.description, existing);
      await ledger.putOrder(record);
      return res.status(200).json({ success: true, order: record });
    }

    if (body.action && body.action !== "create") {
      return res.status(400).json({ error: "Unsupported action. Use create or capture." });
    }
    const rawAmount = body.amount;
    const amount = typeof rawAmount === "number" || typeof rawAmount === "string" ? Number(rawAmount) : Number.NaN;
    if (!Number.isFinite(amount) || amount < 0.01 || amount > 100 || Math.round(amount * 100) !== amount * 100) {
      return res.status(400).json({ error: "Amount must be between 0.01 and 100.00 USD with at most two decimals." });
    }
    const description = String(body.description || "ChannelSwarm agent settlement").trim().slice(0, 127);
    if (!description) return res.status(400).json({ error: "Description cannot be empty." });
    if (!(await ledger.allowCreateForIp(getClientIp(req)))) {
      return res.status(429).json({ error: "Too many order requests. Try again later." });
    }

    const roundedAmount = Math.round(amount * 100) / 100;
    const order = await client.createOrder(roundedAmount, description, randomUUID());
    if (!order.id || !order.approveUrl) throw new Error("PayPal returned no order ID or approval URL.");
    const record = buildRecord(order, roundedAmount.toFixed(2), description);
    await ledger.putOrder(record);
    return res.status(200).json({ success: true, order: record, approveUrl: order.approveUrl });
  } catch (error) {
    console.error("paypal_order_error", error instanceof Error ? error.message : "unknown error");
    return res.status(502).json({ error: "PayPal order operation failed. Check server logs and sandbox configuration." });
  }
}
