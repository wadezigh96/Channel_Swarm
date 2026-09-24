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
      const backpackSymbol = await this.resolveBackpackMarket(symbol);
      if (!backpackSymbol) {
        throw new Error(`No verified Backpack STOCK market for ${symbol}`);
      }

      const result = await this.backpack.marketOrder(
        backpackSymbol,
        side === "buy" ? "Bid" : "Ask",
        units,
        amountUsd
      );

      console.log(
        `[Stock][BACKPACK] ${side.toUpperCase()} ${units.toFixed(6)} ${backpackSymbol} @ $${quote.price.toFixed(4)} order=${result.orderId}`
      );

      return {
        symbol,
        side,
        amount: Number(result.executedQuantity ?? units),
        price: quote.price,
        orderId: result.orderId,
        execution: "backpack",
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
