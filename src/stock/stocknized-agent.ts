/**
 * StocknizedAgent — Specialized agent for tokenized equities on Solana.
 *
 * Market data is sourced from Pyth Hermes when feed IDs are configured.
 * Execution can use a verified Backpack STOCK market when explicitly enabled;
 * otherwise the strategy remains paper-only.
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
  execution: "paper" | "backpack";
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

  /**
   * Execute through Backpack only when explicitly enabled.
   * The adapter verifies that the target market is marked rwaMarketType=STOCK.
   */
  async trade(symbol: string, side: "buy" | "sell", amountUsd: number): Promise<TradeResult> {
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      throw new Error("amountUsd must be greater than zero");
    }

    const quote = await this.getQuote(symbol);
    const units = amountUsd / quote.price;
    const live = process.env.BACKPACK_LIVE_TRADING === "true";

    if (live) {
      const result = await this.backpack.marketOrder(
        symbol,
        side === "buy" ? "Bid" : "Ask",
        units,
        amountUsd
      );

      console.log(
        `[Stock][BACKPACK] ${side.toUpperCase()} ${units.toFixed(6)} ${symbol} @ $${quote.price.toFixed(4)} order=${result.orderId}`
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
      const quote = await this.getQuote(symbol);

      if (quote.changeSinceLastQuote === undefined) {
        console.log(`[Stock] ${symbol}: baseline established @ $${quote.price.toFixed(4)}`);
        continue;
      }

      if (quote.changeSinceLastQuote < -1.5) {
        await this.trade(symbol, "buy", 2.5);
        totalPnl -= 2.5;
      } else if (
        quote.changeSinceLastQuote > 2.0 &&
        (this.portfolio.get(symbol) ?? 0) > 0
      ) {
        const held = this.portfolio.get(symbol)!;
        const value = held * quote.price;
        await this.trade(symbol, "sell", value);
        totalPnl += value;
      }
    }

    console.log(`[Stock] Strategy cycle PnL estimate: $${totalPnl.toFixed(2)}`);
    return totalPnl;
  }

  getPortfolio() {
    return Object.fromEntries(this.portfolio);
  }
}
