import { createPyusdPayment, PyusdConfigurationError } from "../../src/payments/pyusd.js";
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
    const payment = await createPyusdPayment(req.body);
    return res.status(201).json({ payment });
  } catch (error) {
    if (error instanceof PyusdConfigurationError) return res.status(503).json({ error: "pyusd_mainnet_not_configured" });
    if (error instanceof Error && error.name === "ZodError") return res.status(400).json({ error: "invalid_request" });
    if (error instanceof Error && /insufficient_pyusd_balance|payer_token_account|amount_out_of_range|amount_must|mint_changed|transfer_fee|transfer_hook/.test(error.message)) {
      return res.status(422).json({ error: error.message });
    }
    return res.status(502).json({ error: "pyusd_payment_prepare_failed" });
  }
}
