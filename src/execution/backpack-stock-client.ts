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

export interface BackpackRfq {
  rfqId: string;
  clientId?: number;
  symbol: string;
  side: "Bid" | "Ask";
  price?: string;
  quantity?: string;
  quoteQuantity?: string;
  status?: string;
  executionMode?: "AwaitAccept" | "Immediate";
  expiryTime?: number;
  executedQuantity?: string;
  executedQuoteQuantity?: string;
}

export interface BackpackRfqQuote {
  rfqId: string;
  quoteId: string;
  clientId?: number;
  bidPrice?: string;
  askPrice?: string;
  status?: string;
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
  instruction: string,
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const apiKey = process.env.BACKPACK_API_KEY;
  if (!apiKey) throw new Error("BACKPACK_API_KEY is not configured");

  const timestamp = Date.now();
  const payload =
    `instruction=${instruction}&${sortedQuery(body)}&timestamp=${timestamp}&window=${WINDOW}`;

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

    return (await response.json()) as BackpackStockSecurity[];
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

  private assertRisk(notionalUsdc: number): void {
    if (!Number.isFinite(notionalUsdc) || notionalUsdc <= 0) {
      throw new Error("notionalUsdc must be greater than zero");
    }

    const maxUsdc = Number(process.env.BACKPACK_MAX_ORDER_USDC ?? "5");
    if (notionalUsdc > maxUsdc) {
      throw new Error(`Order exceeds configured BACKPACK_MAX_ORDER_USDC=${maxUsdc}`);
    }
  }

  /**
   * Submit a stock RFQ without accepting a quote.
   * This is intentionally separate from execution so a demo can prove
   * the real RFQ path without automatically filling a trade.
   */
  async submitStockRfq(
    symbol: string,
    side: "Bid" | "Ask",
    quantity: number
  ): Promise<BackpackRfq> {
    if (process.env.BACKPACK_LIVE_TRADING !== "true") {
      throw new Error("Live Backpack RFQ is disabled; set BACKPACK_LIVE_TRADING=true explicitly");
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("quantity must be greater than zero");
    }

    const rfqSymbol = symbol.endsWith("_RFQ") ? symbol : `${symbol}_RFQ`;
    const baseSecurity = rfqSymbol.split("_USDC_RFQ")[0];

    const securities = await this.listSecurities();
    const security = securities.find(
      (item) => item.asset === baseSecurity || item.asset === baseSecurity.split(".")[0]
    );

    if (!security) {
      throw new Error(`No verified Backpack security for RFQ symbol: ${rfqSymbol}`);
    }

    const body = {
      clientId: Math.floor(Math.random() * 0x7fffffff),
      quantity: quantity.toFixed(8),
      symbol: rfqSymbol,
      side,
      executionMode: "AwaitAccept",
      autoBorrow: false,
      autoBorrowRepay: false,
      autoLend: false,
      autoLendRedeem: false,
    };

    return signedRequest<BackpackRfq>("rfqSubmit", "/api/v1/rfq", body);
  }

  /**
   * Read the account's open RFQs. Requires API credentials.
   */
  async listOpenRfqs(symbol?: string): Promise<Array<{ rfq: BackpackRfq; quotes: BackpackRfqQuote[] }>> {
    const params: Record<string, unknown> = {};
    if (symbol) params.symbol = symbol;

    const query = sortedQuery(params);
    const path = query ? `/api/v1/rfqs?${query}` : "/api/v1/rfqs";

    const apiKey = process.env.BACKPACK_API_KEY;
    if (!apiKey) throw new Error("BACKPACK_API_KEY is not configured");

    const timestamp = Date.now();
    const payload = `instruction=rfqQuery&${query ? query + "&" : ""}timestamp=${timestamp}&window=${WINDOW}`;
    const signature = nacl.sign.detached(
      Buffer.from(payload, "utf8"),
      signingKeypair().secretKey
    );

    const response = await fetch(`${BASE_URL}${path}`, {
      headers: {
        "X-API-KEY": apiKey,
        "X-SIGNATURE": Buffer.from(signature).toString("base64"),
        "X-TIMESTAMP": String(timestamp),
        "X-WINDOW": String(WINDOW),
      },
    });

    const text = await response.text();
    if (!response.ok) throw new Error(`Backpack RFQs ${response.status}: ${text}`);

    return JSON.parse(text) as Array<{ rfq: BackpackRfq; quotes: BackpackRfqQuote[] }>;
  }

  async acceptStockQuote(rfqId: string, quoteId: string): Promise<BackpackRfq> {
    if (process.env.BACKPACK_LIVE_TRADING !== "true") {
      throw new Error("Live Backpack quote acceptance is disabled");
    }

    if (!rfqId || !quoteId) throw new Error("rfqId and quoteId are required");

    return signedRequest<BackpackRfq>("quoteAccept", "/api/v1/rfq/accept", {
      rfqId,
      quoteId,
    });
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

    this.assertRisk(notionalUsdc);

    const verification = await this.verifyStockMarket(symbol);
    if (!verification.verified) {
      throw new Error(`Not a verified Backpack STOCK market: ${symbol}`);
    }

    if (verification.market.minQuantity && quantity < Number(verification.market.minQuantity)) {
      throw new Error(`Quantity below market minimum: ${verification.market.minQuantity}`);
    }

    if (verification.market.maxQuantity && quantity > Number(verification.market.maxQuantity)) {
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

    return signedRequest<BackpackOrderResult>("orderExecute", "/api/v1/order", body);
  }
}
