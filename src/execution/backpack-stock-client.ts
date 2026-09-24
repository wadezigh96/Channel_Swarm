import nacl from "tweetnacl";

export interface BackpackStockMarket {
  symbol: string;
  baseSymbol?: string;
  quoteSymbol?: string;
  rwaMarketType?: string;
  minQuantity?: string;
  maxQuantity?: string;
  stepSize?: string;
}

export interface BackpackStockSecurity {
  asset: string;
  name?: string;
  sessions?: Array<{
    name: string;
    minQuantity: string;
    maxQuantity: string;
    stepSize: string;
  }>;
}

export interface BackpackStockTicker {
  symbol: string;
  firstPrice: string;
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  volume: string;
  quoteVolume: string;
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

async function signedRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const apiKey = process.env.BACKPACK_API_KEY;
  if (!apiKey) throw new Error("BACKPACK_API_KEY is not configured");

  const timestamp = Date.now();
  const payload =
    `instruction=orderExecute&${sortedQuery(body)}&timestamp=${timestamp}&window=${WINDOW}`;

  const signature = nacl.sign.detached(
    Buffer.from(payload, "utf8"),
    signingKeypair().secretKey
  );

  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
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
      .map((market) => {
        const quantity = market.filters as
          | { quantity?: { minQuantity?: string; maxQuantity?: string; stepSize?: string } }
          | undefined;

        return {
          symbol: String(market.symbol),
          baseSymbol: market.baseSymbol ? String(market.baseSymbol) : undefined,
          quoteSymbol: market.quoteSymbol ? String(market.quoteSymbol) : undefined,
          rwaMarketType: String(market.rwaMarketType),
          minQuantity: quantity?.quantity?.minQuantity,
          maxQuantity: quantity?.quantity?.maxQuantity,
          stepSize: quantity?.quantity?.stepSize,
        };
      });
  }

  async listSecurities(): Promise<BackpackStockSecurity[]> {
    const response = await fetch(`${BASE_URL}/api/v1/securities`);
    if (!response.ok) {
      throw new Error(`Backpack securities ${response.status}: ${await response.text()}`);
    }

    const securities = (await response.json()) as BackpackStockSecurity[];
    return securities;
  }

  async getStockMarket(symbol: string): Promise<BackpackStockMarket | undefined> {
    return (await this.listStockMarkets()).find((market) => market.symbol === symbol);
  }

  async verifyStockMarket(symbol: string): Promise<{
    market: BackpackStockMarket;
    security?: BackpackStockSecurity;
    verified: boolean;
  }> {
    const market = await this.getStockMarket(symbol);
    if (!market) throw new Error(`No Backpack spot STOCK market found for ${symbol}`);

    const securities = await this.listSecurities();
    const base = market.baseSymbol?.split(".")[0] ?? market.baseSymbol ?? symbol.split("_")[0];
    const security = securities.find(
      (item) => item.asset === base || item.asset === market.baseSymbol
    );

    return {
      market,
      security,
      verified: market.rwaMarketType === "STOCK",
    };
  }

  async getTicker(symbol: string, external = false): Promise<BackpackStockTicker> {
    const url = new URL(`${BASE_URL}/api/v1/ticker`);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", "1d");
    if (external) url.searchParams.set("source", "External");

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Backpack ticker ${response.status}: ${await response.text()}`);
    }

    return (await response.json()) as BackpackStockTicker;
  }

  async marketOrder(
    symbol: string,
    side: "Bid" | "Ask",
    quantity: number,
    notionalUsdc: number
  ): Promise<BackpackOrderResult> {
    if (process.env.BACKPACK_LIVE_TRADING !== "true") {
      throw new Error("Live Backpack trading is disabled; set BACKPACK_LIVE_TRADING=true explicitly");
    }

    const maxUsdc = Number(process.env.BACKPACK_MAX_ORDER_USDC ?? "5");
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(notionalUsdc) ||
      notionalUsdc <= 0 ||
      notionalUsdc > maxUsdc
    ) {
      throw new Error(`Order exceeds configured BACKPACK_MAX_ORDER_USDC=${maxUsdc}`);
    }

    const verification = await this.verifyStockMarket(symbol);
    if (!verification.verified) {
      throw new Error(`Not a verified Backpack STOCK market: ${symbol}`);
    }

    if (
      verification.market.minQuantity &&
      quantity < Number(verification.market.minQuantity)
    ) {
      throw new Error(`Quantity below market minimum: ${verification.market.minQuantity}`);
    }

    if (
      verification.market.maxQuantity &&
      quantity > Number(verification.market.maxQuantity)
    ) {
      throw new Error(`Quantity above market maximum: ${verification.market.maxQuantity}`);
    }

    const body = {
      symbol,
      side,
      orderType: "Market",
      quantity: quantity.toFixed(8),
      timeInForce: "IOC",
      autoBorrow: false,
      autoBorrowRepay: false,
      autoLend: false,
      autoLendRedeem: false,
      postOnly: false,
      selfTradePrevention: "RejectTaker",
    };

    return signedRequest<BackpackOrderResult>("/api/v1/order", body);
  }
}
