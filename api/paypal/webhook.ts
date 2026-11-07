import { PayPalConfigurationError, verifyPayPalWebhookSignature } from "../../src/payments/paypal-sandbox.js";

type VercelRequest = { method?: string; headers: Record<string, string | string[] | undefined>; body?: any };
type VercelResponse = { status(code: number): VercelResponse; json(body: unknown): void };

function header(req: VercelRequest, name: string): string {
  const value = req.headers[name];
  return typeof value === "string" ? value : "";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (Buffer.byteLength(JSON.stringify(req.body ?? {}), "utf8") > 64_000) {
    return res.status(413).json({ error: "request_too_large" });
  }
  try {
    const verified = await verifyPayPalWebhookSignature({
      authAlgo: header(req, "paypal-auth-algo"),
      certUrl: header(req, "paypal-cert-url"),
      transmissionId: header(req, "paypal-transmission-id"),
      transmissionSignature: header(req, "paypal-transmission-sig"),
      transmissionTime: header(req, "paypal-transmission-time"),
    }, req.body);
    if (!verified) return res.status(400).json({ error: "invalid_webhook_signature" });
    const eventType = typeof req.body?.event_type === "string" ? req.body.event_type : "UNKNOWN";
    const eventId = typeof req.body?.id === "string" ? req.body.id : null;
    console.info(JSON.stringify({ component: "paypal-webhook", verified: true, eventType, eventId }));
    return res.status(200).json({ received: true, verified: true, eventType, eventId });
  } catch (error) {
    if (error instanceof PayPalConfigurationError) return res.status(503).json({ error: "paypal_webhook_not_configured" });
    return res.status(400).json({ error: "webhook_verification_failed" });
  }
}
