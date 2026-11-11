/**
 * Vercel serverless function: create a PayPal sandbox order.
 * POST /api/paypal-order
 * Body: { amount?: number, description?: string }
 *
 * Requires env:
 *   PAYPAL_CLIENT_ID
 *   PAYPAL_CLIENT_SECRET
 *   PAYPAL_MODE=sandbox (default)
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { PayPalClient } from "../src/paypal/paypal-client.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const client = new PayPalClient();
  if (!client.isConfigured()) {
    return res.status(500).json({
      error: "PayPal credentials missing. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in Vercel env.",
    });
  }

  try {
    const amount = Number(req.body?.amount) || 5.0;
    const description = String(req.body?.description || "ChannelSwarm agent settlement");

    if (amount <= 0 || amount > 100) {
      return res.status(400).json({ error: "Amount must be between 0.01 and 100 USD" });
    }

    const order = await client.createOrder(amount, description);

    return res.status(200).json({
      success: true,
      orderId: order.id,
      status: order.status,
      approveUrl: order.approveUrl,
      amount,
      description,
    });
  } catch (err) {
    console.error("[api/paypal-order]", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "PayPal order creation failed",
    });
  }
}
