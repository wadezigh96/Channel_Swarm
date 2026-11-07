import { createPayPalSandboxOrder, PayPalConfigurationError } from "../../src/payments/paypal-sandbox.js";
import { isAuthorizedApiRequest } from "../../src/security/api-auth.js";

type VercelRequest = { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown };
type VercelResponse = { status(code: number): VercelResponse; json(body: unknown): void };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!isAuthorizedApiRequest(req.headers.authorization)) return res.status(401).json({ error: "unauthorized" });
  try {
    const order = await createPayPalSandboxOrder(req.body);
    return res.status(201).json({ order });
  } catch (error) {
    if (error instanceof PayPalConfigurationError) return res.status(503).json({ error: "paypal_sandbox_not_configured" });
    if (error instanceof Error && error.name === "ZodError") return res.status(400).json({ error: "invalid_request" });
    return res.status(502).json({ error: "paypal_order_creation_failed" });
  }
}
