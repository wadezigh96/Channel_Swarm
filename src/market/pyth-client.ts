import { HermesClient } from "@pythnetwork/hermes-client";

export interface PythQuote {
  symbol: string;
  price: number;
  confidence: number;
  publishTime: number;
  priceFeedId: string;
}

const HERMES_URL = process.env.PYTH_HERMES_URL ?? "https://pyth.dourolabs.app/hermes";

const FEEDS: Record<string, string> = {
  AAPL: process.env.PYTH_AAPL_FEED_ID ?? "",
  MSFT: process.env.PYTH_MSFT_FEED_ID ?? "",
  NVDA: process.env.PYTH_NVDA_FEED_ID ?? "",
  TSLA: process.env.PYTH_TSLA_FEED_ID ?? "",
};

function client(): HermesClient {
  return new HermesClient(HERMES_URL, {
    accessToken: process.env.PYTH_API_KEY,
  });
}

export async function getPythQuote(symbol: string): Promise<PythQuote> {
  const normalized = symbol.toUpperCase();
  const priceFeedId = FEEDS[normalized];
  if (!priceFeedId) throw new Error(`missing_pyth_feed_id:${normalized}`);

  const response = await client().getLatestPriceUpdates([priceFeedId]);
  const feed = response.parsed?.[0];
  if (!feed?.price) throw new Error(`pyth_price_unavailable:${normalized}`);

  const price = Number(feed.price.price) * 10 ** Number(feed.price.expo);
  const confidence = Number(feed.price.conf) * 10 ** Number(feed.price.expo);
  const publishTime = Number(feed.price.publish_time);

  if (!Number.isFinite(price) || price <= 0) throw new Error(`invalid_pyth_price:${normalized}`);

  return { symbol: normalized, price, confidence, publishTime, priceFeedId };
}

export function configuredPythSymbols(): string[] {
  return Object.entries(FEEDS).filter(([, id]) => Boolean(id)).map(([symbol]) => symbol);
}
