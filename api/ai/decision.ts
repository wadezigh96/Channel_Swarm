import { decideAgentIntent, AiGatewayConfigurationError } from "../../src/ai/gateway.js";
import { isAuthorizedApiRequest } from "../../src/security/api-auth.js";

type VercelRequest = { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown };
type VercelResponse = { status(code: number): VercelResponse; json(body: unknown): void };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!isAuthorizedApiRequest(req.headers.authorization)) return res.status(401).json({ error: "unauthorized" });
  try {
    if (Buffer.byteLength(JSON.stringify(req.body ?? {}), "utf8") > 8_192) {
      return res.status(413).json({ error: "request_too_large" });
    }
    // Vercel Functions expose the deployment OIDC token on each request header.
    // Keep AI_GATEWAY_API_KEY as the local/non-Vercel fallback.
    const oidcHeader = req.headers["x-vercel-oidc-token"];
    const oidcToken = typeof oidcHeader === "string"
      ? oidcHeader
      : Array.isArray(oidcHeader) ? oidcHeader[0] : undefined;
    const decision = await decideAgentIntent(req.body, {
      apiKey: process.env.AI_GATEWAY_API_KEY || oidcToken || process.env.VERCEL_OIDC_TOKEN,
    });
    return res.status(200).json({ decision });
  } catch (error) {
    if (error instanceof AiGatewayConfigurationError) return res.status(503).json({ error: "ai_runtime_not_configured" });
    if (error instanceof Error && error.name === "ZodError") return res.status(400).json({ error: "invalid_request" });
    return res.status(502).json({ error: "ai_decision_unavailable" });
  }
}
