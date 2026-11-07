import { timingSafeEqual } from "node:crypto";
import { decideAgentIntent, AiGatewayConfigurationError } from "../../src/ai/gateway.js";

type VercelRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};
type VercelResponse = {
  status(code: number): VercelResponse;
  json(body: unknown): void;
};

function authorized(header: string | string[] | undefined): boolean {
  const expected = process.env.CHANNELSWARM_API_TOKEN;
  if (!expected || typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const configured = Buffer.from(expected);
  return supplied.length === configured.length && timingSafeEqual(supplied, configured);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  if (!authorized(req.headers.authorization)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  try {
    if (Buffer.byteLength(JSON.stringify(req.body ?? {}), "utf8") > 8_192) {
      res.status(413).json({ error: "request_too_large" });
      return;
    }
    const decision = await decideAgentIntent(req.body);
    res.status(200).json({ decision });
  } catch (error) {
    if (error instanceof AiGatewayConfigurationError) {
      res.status(503).json({ error: "ai_runtime_not_configured" });
      return;
    }
    if (error instanceof Error && error.name === "ZodError") {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    res.status(502).json({ error: "ai_decision_unavailable" });
  }
}
