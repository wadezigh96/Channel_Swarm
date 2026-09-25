import { getPythQuote, hasPythApiKey } from "../../src/market/pyth-client.js";

const ALLOWED = new Set(["AAPL", "MSFT", "NVDA", "TSLA", "SPCX"]);

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "GET") {
    res.status(405).json({ success: false, error: "method_not_allowed" });
    return;
  }

  const symbol = String(req.query?.symbol ?? "AAPL").trim().toUpperCase();
  if (!ALLOWED.has(symbol)) {
    res.status(400).json({
      success: false,
      error: "unsupported_symbol",
      supported: [...ALLOWED],
    });
    return;
  }

  const pythConfigured = hasPythApiKey();

  try {
    const quote = await getPythQuote(symbol);
    res.status(200).json({
      success: true,
      source: pythConfigured ? "pyth_pro" : "paper_fallback",
      quote,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const safeMessage = message
      .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
      .replace(/(?:api[_-]?key|access[_-]?token)[=:]\s*\S+/gi, "$1=[redacted]")
      .slice(0, 300);

    // Keep the upstream failure visible in Vercel logs without ever logging
    // the Pyth API key or authorization header.
    console.error("stock_quote_upstream_error", {
      symbol,
      source: pythConfigured ? "pyth_pro" : "paper_fallback",
      error: safeMessage,
    });

    res.status(502).json({
      success: false,
      source: pythConfigured ? "pyth_pro" : "paper_fallback",
      error: safeMessage,
      diagnostic: {
        provider: "pyth_pro",
        configured: pythConfigured,
        symbol,
      },
    });
  }
}
