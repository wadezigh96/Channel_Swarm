import type { VercelRequest, VercelResponse } from "@vercel/node";
import { PayPalOrderLedger } from "../src/paypal/order-ledger.js";
import { parseRailAdvice, recommendRailByRules } from "../src/payments/rail-advisor.js";

function getIp(req: VercelRequest): string {
  const realIp = req.headers["x-real-ip"];
  const forwarded = req.headers["x-forwarded-for"];
  const firstForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
  return (Array.isArray(realIp) ? realIp[0] : realIp) || firstForwarded?.trim() || "unknown";
}

function readBody(req: VercelRequest): Record<string, unknown> {
  if (req.body && typeof req.body === "object") return req.body as Record<string, unknown>;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body) as Record<string, unknown>; } catch { return {}; }
  }
  return {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  const body = readBody(req);
  const amount = typeof body.amountUsd === "number" || typeof body.amountUsd === "string" ? Number(body.amountUsd) : Number.NaN;
  const purpose = typeof body.purpose === "string" ? body.purpose.trim().slice(0, 500) : "";
  if (!Number.isFinite(amount) || amount < 0.01 || amount > 100_000) {
    return res.status(400).json({ error: "amountUsd must be between 0.01 and 100000." });
  }
  if (!purpose) return res.status(400).json({ error: "purpose is required." });

  const fallback = recommendRailByRules(amount, purpose);
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  const baseUrl = process.env.AI_GATEWAY_BASE_URL;
  const model = process.env.AI_GATEWAY_MODEL;
  if (!apiKey || !baseUrl || !model) {
    return res.status(200).json({ advice: fallback, source: "rules_only", advisoryOnly: true });
  }

  const ledger = new PayPalOrderLedger();
  let allowed = false;
  try {
    allowed = await ledger.allowRequestForIp("rail-advisor", getIp(req), 20, 3600);
  } catch {
    // Fail closed for paid model calls when production rate limiting is unavailable.
    return res.status(200).json({ advice: fallback, source: "rules_only", advisoryOnly: true, note: "AI Gateway rate limiter is not configured." });
  }
  if (!allowed) return res.status(429).json({ error: "Advisor request limit reached. Try again later." });

  try {
    const gatewayUrl = new URL(baseUrl);
    if (gatewayUrl.protocol !== "https:" && gatewayUrl.hostname !== "localhost") {
      return res.status(400).json({ error: "AI Gateway URL must use HTTPS." });
    }
    const response = await fetch(`${gatewayUrl.href.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 180,
        messages: [
          {
            role: "system",
            content: "You are a payment rail advisor, not an executor. Recommend only one rail: solana, paypal, or manual_review. Consider amount and purpose. A Solana channel needs a funded wallet and supported mint; PayPal needs merchant credentials and payer approval. For risk, refund, dispute, or ambiguity choose manual_review. Never claim a payment has been sent. Return only JSON: {\"rail\":\"solana|paypal|manual_review\",\"reason\":\"short explanation\"}.",
          },
          { role: "user", content: JSON.stringify({ amountUsd: amount, purpose }) },
        ],
      }),
    });
    if (!response.ok) throw new Error("AI Gateway request failed.");
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const advice = parseRailAdvice(payload.choices?.[0]?.message?.content || "");
    if (!advice) throw new Error("AI Gateway returned an invalid advisor response.");
    return res.status(200).json({ advice, source: "ai_gateway", advisoryOnly: true });
  } catch {
    return res.status(200).json({ advice: fallback, source: "rules_fallback", advisoryOnly: true });
  }
}
