import { createPayPalSandboxOrder, PayPalConfigurationError } from "../../src/payments/paypal-sandbox.js";
import { isAllowedBrowserOrigin } from "../../src/security/origin.js";

type VercelRequest = { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown };
type VercelResponse = { status(code: number): VercelResponse; json(body: unknown): void };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!isAllowedBrowserOrigin(req.headers.origin)) return res.status(403).json({ error: "origin_not_allowed" });
  if (Buffer.byteLength(JSON.stringify(req.body ?? {}), "utf8") > 4_096) {
    return res.status(413).json({ error: "request_too_large" });
  }
  try {
    const order = await createPayPalSandboxOrder(req.body);
    return res.status(201).json({ order });
  } catch (error) {
    if (error instanceof PayPalConfigurationError) return res.status(503).json({ error: "paypal_sandbox_not_configured" });
    if (error instanceof Error && error.name === "ZodError") return res.status(400).json({ error: "invalid_request" });
    if (error instanceof Error && /APP_BASE_URL/.test(error.message)) return res.status(503).json({ error: "app_base_url_not_configured" });
    return res.status(502).json({ error: "paypal_order_creation_failed" });
  }
}
