export interface PythQuote {
  symbol: string;
  price: number;
  confidence: number;
  publishTime: number;
  feedUpdateTimestamp: number;
  priceFeedId: number;
  marketSession?: string;
}

const PYTH_PRO_URL =
  process.env.PYTH_PRO_URL ?? "https://pyth-lazer.dourolabs.app";

const FEEDS: Record<string, number> = {
  AAPL: 3191,
  MSFT: 3196,
  NVDA: 3188,
  TSLA: 3185,
  SPCX: 3316,
};

/** Deterministic paper bases when PYTH_API_KEY is missing (demo / sim). */
const PAPER_BASE: Record<string, number> = {
  AAPL: 190.0,
  MSFT: 420.0,
  NVDA: 120.0,
  TSLA: 250.0,
  SPCX: 100.0,
};

function configuredFeeds(): Record<string, number> {
  const configured: Record<string, number> = { ...FEEDS };

  for (const symbol of Object.keys(FEEDS)) {
    const envKey = `PYTH_${symbol}_FEED_ID`;
    const value = process.env[envKey];
    if (value !== undefined && value !== "") {
      const id = Number(value);
      if (!Number.isInteger(id) || id <= 0) {
        throw new Error(`invalid_pyth_feed_id:${symbol}`);
      }
      configured[symbol] = id;
    }
  }

  return configured;
}

export function hasPythApiKey(): boolean {
  return Boolean(process.env.PYTH_API_KEY?.trim());
}

/**
 * Deterministic paper quote for simulation when no Pyth API key is configured.
 * Slight minute-level wobble lets the strategy see non-zero change across cycles.
 */
export function getPaperQuote(symbol: string): PythQuote {
  const normalized = symbol.toUpperCase();
  const base = PAPER_BASE[normalized];
  if (base === undefined) {
    throw new Error(`missing_paper_feed:${normalized}`);
  }

  const tick = Math.floor(Date.now() / 60_000);
  const wobble = 1 + ((tick + normalized.charCodeAt(0)) % 7) * 0.001 - 0.003;
  const price = base * wobble;
  const now = Date.now();

  return {
    symbol: normalized,
    price,
    confidence: price * 0.001,
    publishTime: Math.floor(now / 1000),
    feedUpdateTimestamp: now * 1000,
    priceFeedId: configuredFeeds()[normalized] ?? 0,
    marketSession: "paper",
  };
}

function apiKey(): string {
  const key = process.env.PYTH_API_KEY;
  if (!key) throw new Error("missing_pyth_api_key");
  return key;
}

interface PythProFeed {
  priceFeedId: number;
  price?: string | number;
  confidence?: string | number;
  exponent: number;
  feedUpdateTimestamp: number | string;
  marketSession?: string;
}

interface PythProResponse {
  parsed?: {
    timestampUs?: number | string;
    priceFeeds?: PythProFeed[];
  };
}

export async function getPythQuote(symbol: string): Promise<PythQuote> {
  if (!hasPythApiKey()) {
    return getPaperQuote(symbol);
  }

  const normalized = symbol.toUpperCase();
  const priceFeedId = configuredFeeds()[normalized];

  if (!priceFeedId) {
    throw new Error(`missing_pyth_feed_id:${normalized}`);
  }

  const response = await fetch(`${PYTH_PRO_URL}/v1/latest_price`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      priceFeedIds: [priceFeedId],
      properties: [
        "price",
        "confidence",
        "feedUpdateTimestamp",
        "marketSession",
      ],
      formats: [],
      channel: process.env.PYTH_PRO_CHANNEL ?? "fixed_rate@200ms",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`pyth_pro_http_${response.status}:${body.slice(0, 300)}`);
  }

  const payload = (await response.json()) as PythProResponse;
  const feed = payload.parsed?.priceFeeds?.[0];

  if (!feed || feed.price === undefined) {
    throw new Error(`pyth_price_unavailable:${normalized}`);
  }

  const price = Number(feed.price) * 10 ** Number(feed.exponent);
  const confidence = Number(feed.confidence ?? 0) * 10 ** Number(feed.exponent);
  const feedUpdateTimestamp = Number(feed.feedUpdateTimestamp);
  const publishTime = Math.floor(feedUpdateTimestamp / 1_000_000);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`invalid_pyth_price:${normalized}`);
  }

  if (!Number.isFinite(feedUpdateTimestamp) || feedUpdateTimestamp <= 0) {
    throw new Error(`invalid_pyth_timestamp:${normalized}`);
  }

  return {
    symbol: normalized,
    price,
    confidence,
    publishTime,
    feedUpdateTimestamp,
    priceFeedId,
    marketSession: feed.marketSession,
  };
}

export function configuredPythSymbols(): string[] {
  return Object.keys(configuredFeeds());
}
