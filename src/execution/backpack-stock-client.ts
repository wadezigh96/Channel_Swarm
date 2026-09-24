import nacl from "tweetnacl";

export interface BackpackStockMarket {
  symbol: string;
  baseSymbol?: string;
  quoteSymbol?: string;
  rwaMarketType?: string;
}

export interface BackpackOrderResult {
  orderId: string;
  clientId?: number;
  symbol: string;
  side: "Bid" | "Ask";
  status?: string;
  executedQuantity?: string;
  executedQuoteQuantity?: string;
}

const BASE_URL = process.env.BACKPACK_API_URL ?? "https://api.backpack.exchange";
const WINDOW = 5000;

function sortedQuery(values: Record<string, unknown>): string {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("&");
}

function signingKeypair(): nacl.SignKeyPair {
  const seed = process.env.BACKPACK_API_SECRET;
  if (!seed) throw new Error("BACKPACK_API_SECRET is not configured");
  const bytes = Buffer.from(seed, "base64");
  if (bytes.length !== 32) {
    throw new Error("BACKPACK_API_SECRET must be a base64-encoded 32-byte Ed25519 seed");
  }
  return nacl.sign.keyPair.fromSeed(bytes);
}

async function signedRequest<T>(
  method: "POST",
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const apiKey = process.env.BACKPACK_API_KEY;
  if (!apiKey) throw new Error("BACKPACK_API_KEY is not configured");

  const timestamp = Date.now();
  const payload = `instruction=orderExecute&${sortedQuery(body)}&timestamp=${timestamp}&window=${WINDOW}`;
  const signature = nacl.sign.detached(
    Buffer.from(payload, "utf8"),
    signingKeypair().secretKey
  );

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
      "X-SIGNATURE": Buffer.from(signature).toString("base64"),
      "X-TIMESTAMP": String(timestamp),
      "X-WINDOW": String(WINDOW),
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Backpack API ${response.status}: ${text}`);
  }

  return JSON.parse(text) as T;
}

export class BackpackStockClient {
  async listStockMarkets(): Promise<BackpackStockMarket[]> {
    const response = await fetch(`${BASE_URL}/api/v1/markets`);
    if (!response.ok) {
      throw new Error(`Backpack markets ${response.status}: ${await response.text()}`);
    }

    const markets = (await response.json()) as Array<Record<string, unknown>>;
    return markets
      .filter((market) => market.rwaMarketType === "STOCK")
      .map((market) => ({
        symbol: String(market.symbol),
        baseSymbol: market.baseSymbol ? String(market.baseSymbol) : undefined,
        quoteSymbol: market.quoteSymbol ? String(market.quoteSymbol) : undefined,
        rwaMarketType: String(market.rwaMarketType),
      }));
  }

  async getStockMarket(symbol: string): Promise<BackpackStockMarket | undefined> {
    const markets = await this.listStockMarkets();
    return markets.find((market) => market.symbol === symbol);
  }

  async marketOrder(
    symbol: string,
    side: "Bid" | "Ask",
    quoteQuantity: number
  ): Promise<BackpackOrderResult> {
    if (process.env.BACKPACK_LIVE_TRADING !== "true") {
      throw new Error("Live Backpack trading is disabled; set BACKPACK_LIVE_TRADING=true explicitly");
    }

    const maxUsdc = Number(process.env.BACKPACK_MAX_ORDER_USDC ?? "5");
    if (!Number.isFinite(quoteQuantity) || quoteQuantity <= 0 || quoteQuantity > maxUsdc) {
      throw new Error(`Order exceeds configured BACKPACK_MAX_ORDER_USDC=${maxUsdc}`);
    }

    const market = await this.getStockMarket(symbol);
    if (!market) throw new Error(`Not a verified Backpack STOCK market: ${symbol}`);

    const body = {
      symbol,
      side,
      orderType: "Market",
      quoteQuantity: quoteQuantity.toFixed(6),
      timeInForce: "IOC",
      autoBorrow: false,
      autoBorrowRepay: false,
      autoLend: false,
      autoLendRedeem: false,
      postOnly: false,
      selfTradePrevention: "RejectTaker",
    };

    return signedRequest<BackpackOrderResult>("POST", "/api/v1/order", body);
  }
}
