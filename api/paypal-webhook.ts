import type { VercelRequest, VercelResponse } from "@vercel/node";
import { PayPalClient } from "../src/paypal/paypal-client.js";
import { PayPalOrderLedger } from "../src/paypal/order-ledger.js";

type PayPalWebhookEvent = {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    supplementary_data?: { related_ids?: { order_id?: string } };
  };
};

function header(req: VercelRequest, name: string): string {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function getOrderId(event: PayPalWebhookEvent): string | undefined {
  const resource = event.resource;
  return resource?.supplementary_data?.related_ids?.order_id ||
    (event.event_type?.startsWith("CHECKOUT.ORDER.") ? resource?.id : undefined);
}

function statusForEvent(type: string): string | undefined {
  const statuses: Record<string, string> = {
    "CHECKOUT.ORDER.APPROVED": "APPROVED",
    "CHECKOUT.ORDER.COMPLETED": "COMPLETED",
    "CHECKOUT.ORDER.VOIDED": "VOIDED",
    "PAYMENT.CAPTURE.PENDING": "PENDING",
    "PAYMENT.CAPTURE.COMPLETED": "COMPLETED",
    "PAYMENT.CAPTURE.DENIED": "DENIED",
    "PAYMENT.CAPTURE.REVERSED": "REVERSED",
  };
  return statuses[type];
}

function statusForRefundCapture(captureStatus: string | undefined): string {
  switch (captureStatus) {
    case "PARTIALLY_REFUNDED": return "PARTIALLY_REFUNDED";
    case "REFUNDED": return "REFUNDED";
    default: return "REFUND_REVIEW";
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return res.status(503).json({ error: "PayPal webhook has not been registered." });
  const ledger = new PayPalOrderLedger();
  if (!ledger.isPersistentStoreConfigured()) {
    return res.status(503).json({ error: "Configure Upstash REST URL and token before enabling webhooks." });
  }

  const event = req.body as PayPalWebhookEvent;
  if (!event || typeof event !== "object" || !event.id || !event.event_type) {
    return res.status(400).json({ error: "Invalid PayPal webhook payload." });
  }
  const webhookHeaders = {
    auth_algo: header(req, "paypal-auth-algo"),
    cert_url: header(req, "paypal-cert-url"),
    transmission_id: header(req, "paypal-transmission-id"),
    transmission_sig: header(req, "paypal-transmission-sig"),
    transmission_time: header(req, "paypal-transmission-time"),
  };
  if (Object.values(webhookHeaders).some((value) => !value)) {
    return res.status(400).json({ error: "Missing PayPal transmission headers." });
  }

  try {
    const client = new PayPalClient();
    if (!client.isConfigured()) return res.status(503).json({ error: "PayPal API credentials are not configured." });
    const verified = await client.verifyWebhookSignature(webhookHeaders, webhookId, event);
    if (!verified) return res.status(400).json({ error: "Webhook signature verification failed." });

    const orderId = getOrderId(event);
    if (orderId) {
      const record = await ledger.getOrder(orderId);
      if (record) {
        let status = statusForEvent(event.event_type);
        if (event.event_type === "PAYMENT.CAPTURE.REFUNDED") {
          const captureId = event.resource?.id;
          if (!captureId) {
            status = "REFUND_REVIEW";
          } else {
            const capture = await client.getCapture(captureId);
            status = statusForRefundCapture(capture.status);
          }
        }
        if (status) {
          record.status = status;
          record.updatedAt = new Date().toISOString();
          record.lastEventId = event.id;
          if (event.event_type.startsWith("PAYMENT.CAPTURE.") && event.resource?.id) {
            record.captureId = event.resource.id;
          }
          await ledger.putOrder(record);
        }
      }
    }

    const firstDelivery = await ledger.markWebhookEvent(event.id);
    return res.status(200).json({ received: true, duplicate: !firstDelivery });
  } catch (error) {
    console.error("paypal_webhook_error", error instanceof Error ? error.message : "unknown error");
    return res.status(503).json({ error: "Webhook processing is temporarily unavailable." });
  }
}
