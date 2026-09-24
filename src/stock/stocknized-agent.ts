/**
 * StocknizedAgent — Specialized agent for tokenized equities on Solana.
 *
 * Pyth provides the strategy price feed. Backpack provides an independently
 * verified STOCK market/security layer. Live execution remains opt-in.
 */

import { Connection, Keypair } from "@solana/web3.js";
import { getPythQuote } from "../market/pyth-client.js";
import { BackpackStockClient } from "../execution/backpack-stock-client.js";

export interface StockQuote {
  symbol: string;
  price: number;
  confidence: number;
  publishTime: number;
  priceFeedId: string;
  changeSinceLastQuote?: number;
}

export interface TradeResult {
  symbol: string;
  side: "buy" | "sell";
  amount: number;
  price: number;
  orderId?: string;
  txSignature?: string;
  execution: "paper" | "backpack" | "rfq";
}

export interface StockDecision {
  symbol: string;
  action: "buy" | "sell" | "hold";
  reason: string;
  amountUsd?: number;
  pythPrice: number;
  pythChangePercent?: number;
  verifiedBackpackMarket?: string;
}

export class StocknizedAgent {
  private connection: Connection;
  private wallet: Keypair;
  private portfolio = new Map<string, number>();
  private lastPrices = new Map<string, number>();
  private backpack = new BackpackStockClient();

  constructor(connection: Connection, wallet: Keypair) {
    this.connection = connection;
    this.wallet = wallet;
  }

  async getQuote(symbol: string): Promise<StockQuote> {
    const quote = await getPythQuote(symbol);
    const previous = this.lastPrices.get(quote.symbol);
    const changeSinceLastQuote =
      previous && previous > 0 ? ((quote.price - previous) / previous) * 100 : undefined;

    this.lastPrices.set(quote.symbol, quote.price);

    return {
      ...quote,
      priceFeedId: String(quote.priceFeedId),
      changeSinceLastQuote,
    };
  }

  private async resolveBackpackMarket(symbol: string): Promise<string | undefined> {
    const markets = await this.backpack.listStockMarkets();
    const normalized = symbol.toUpperCase();

    const exact = markets.find(
      (market) =>
        market.baseSymbol?.toUpperCase() === normalized ||
        market.baseSymbol?.split(".")[0].toUpperCase() === normalized
    );

    return exact?.symbol;
  }

  async decide(symbol: string): Promise<StockDecision> {
    const quote = await this.getQuote(symbol);
    const backpackSymbol = await this.resolveBackpackMarket(symbol).catch(() => undefined);

    if (quote.changeSinceLastQuote === undefined) {
      return {
        symbol,
        action: "hold",
        reason: "baseline",
        pythPrice: quote.price,
        pythChangePercent: quote.changeSinceLastQuote,
        verifiedBackpackMarket: backpackSymbol,
      };
    }

    if (quote.changeSinceLastQuote < -1.5) {
      return {
        symbol,
        action: "buy",
        reason: "pyth_drop_below_threshold",
        amountUsd: 2.5,
        pythPrice: quote.price,
        pythChangePercent: quote.changeSinceLastQuote,
        verifiedBackpackMarket: backpackSymbol,
      };
    }

    if (
      quote.changeSinceLastQuote > 2.0 &&
      (this.portfolio.get(symbol) ?? 0) > 0
    ) {
      const held = this.portfolio.get(symbol)!;
      return {
        symbol,
        action: "sell",
        reason: "pyth_rise_above_threshold",
        amountUsd: held * quote.price,
        pythPrice: quote.price,
        pythChangePercent: quote.changeSinceLastQuote,
        verifiedBackpackMarket: backpackSymbol,
      };
    }

    return {
      symbol,
      action: "hold",
      reason: "threshold_not_reached",
      pythPrice: quote.price,
      pythChangePercent: quote.changeSinceLastQuote,
      verifiedBackpackMarket: backpackSymbol,
    };
  }

  /**
   * Execute only after the decision layer. The default remains paper mode.
   * Backpack spot order execution is reserved for verified STOCK markets.
   */
  async trade(symbol: string, side: "buy" | "sell", amountUsd: number): Promise<TradeResult> {
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      throw new Error("amountUsd must be greater than zero");
    }

    const quote = await this.getQuote(symbol);
    const units = amountUsd / quote.price;
    const live = process.env.BACKPACK_LIVE_TRADING === "true";

    if (live) {
      const rfqSymbol = await this.backpack.resolveRfqSymbol(symbol);
      const rfq = await this.backpack.submitStockRfq(
        symbol,
        side === "buy" ? "Bid" : "Ask",
        units,
        amountUsd
      );

      console.log(
        `[Stock][RFQ] submitted ${side.toUpperCase()} ${units.toFixed(6)} ${rfqSymbol} rfq=${rfq.rfqId}`
      );

      if (process.env.BACKPACK_AUTO_ACCEPT_RFQ !== "true") {
        return {
          symbol,
          side,
          amount: units,
          price: quote.price,
          orderId: rfq.rfqId,
          execution: "rfq",
        };
      }

      const timeoutMs = Number(process.env.BACKPACK_RFQ_WAIT_MS ?? "10000");
      const deadline = Date.now() + Math.max(1000, timeoutMs);
      let bestQuote: { quoteId: string; price: number } | undefined;

      while (Date.now() < deadline) {
        const open = await this.backpack.listOpenRfqs(rfqSymbol);
        const current = open.find((entry) => entry.rfq.rfqId === rfq.rfqId);

        if (current) {
          const active = current.quotes.filter(
            (item) => !item.status || ["New", "Active"].includes(item.status)
          );

          const priced = active
            .map((item) => {
              const raw = side === "buy" ? item.askPrice : item.bidPrice;
              return { quoteId: item.quoteId, price: raw === undefined ? NaN : Number(raw) };
            })
            .filter((item) => Number.isFinite(item.price));

          if (priced.length > 0) {
            bestQuote = priced.reduce((best, item) =>
              side === "buy"
                ? item.price < best.price ? item : best
                : item.price > best.price ? item : best
            );
            break;
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      if (!bestQuote) {
        throw new Error(`No active Backpack RFQ quote received for ${rfq.rfqId}`);
      }

      const accepted = await this.backpack.acceptStockQuote(rfq.rfqId, bestQuote.quoteId);

      console.log(
        `[Stock][RFQ] accepted ${bestQuote.quoteId} rfq=${rfq.rfqId} status=${accepted.status ?? "unknown"}`
      );

      return {
        symbol,
        side,
        amount: Number(accepted.executedQuantity ?? units),
        price: Number(accepted.price ?? bestQuote.price),
        orderId: rfq.rfqId,
        execution: "rfq",
      };
    }

    if (side === "buy") {
      this.portfolio.set(symbol, (this.portfolio.get(symbol) ?? 0) + units);
    } else {
      const held = this.portfolio.get(symbol) ?? 0;
      if (held < units) throw new Error(`Insufficient ${symbol}`);
      this.portfolio.set(symbol, held - units);
    }

    console.log(
      `[Stock][PAPER] ${side.toUpperCase()} ${units.toFixed(6)} ${symbol} @ $${quote.price.toFixed(4)} ($${amountUsd.toFixed(2)})`
    );

    return {
      symbol,
      side,
      amount: units,
      price: quote.price,
      execution: "paper",
    };
  }

  async runStrategy(symbols: string[] = ["AAPL", "TSLA", "NVDA"]): Promise<number> {
    let totalPnl = 0;

    for (const symbol of symbols) {
      const decision = await this.decide(symbol);

      if (decision.action === "buy" && decision.amountUsd) {
        await this.trade(symbol, "buy", decision.amountUsd);
        totalPnl -= decision.amountUsd;
      } else if (decision.action === "sell" && decision.amountUsd) {
        await this.trade(symbol, "sell", decision.amountUsd);
        totalPnl += decision.amountUsd;
      } else {
        console.log(
          `[Stock] ${symbol}: HOLD (${decision.reason}) @ $${decision.pythPrice.toFixed(4)}`
        );
      }
    }

    console.log(`[Stock] Strategy cycle PnL estimate: $${totalPnl.toFixed(2)}`);
    return totalPnl;
  }

  getPortfolio() {
    return Object.fromEntries(this.portfolio);
  }
}
