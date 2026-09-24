/**
 * StocknizedAgent — specialized agent for tokenized equities on Solana.
 *
 * Price feed: Pyth (or deterministic paper quotes).
 * Execution modes (EXECUTION_MODE):
 *   paper    — in-memory portfolio (default)
 *   backpack — Backpack STOCK RFQ (opt-in live)
 *   jupiter  — Jupiter swap of xStock mints (opt-in live)
 */

import { Connection, Keypair } from "@solana/web3.js";
import { getPythQuote, hasPythApiKey } from "../market/pyth-client.js";
import { BackpackStockClient } from "../execution/backpack-stock-client.js";
import { getRfqExecutionProof } from "../execution/backpack-rfq-proof.js";
import { executeJupiterXStockTrade, hasXStockMint } from "./jupiter-executor.js";
import { resolveExecutionMode, type ExecutionMode } from "./execution-mode.js";

export interface StockQuote {
  symbol: string;
  price: number;
  confidence: number;
  publishTime: number;
  priceFeedId: number;
  changeSinceLastQuote?: number;
}

export interface ExecutionProof {
  mode: ExecutionMode;
  at: string;
  symbol: string;
  side: "buy" | "sell";
  /** Human units traded (stock for paper/backpack; depends on side for jupiter). */
  amount: number;
  price: number;
  orderId?: string;
  txSignature?: string;
  /** Backpack RFQ filled record when available. */
  rfqFilled?: {
    rfqId: string;
    status?: string;
    price?: string;
    executedQuantity?: string;
    executedQuoteQuantity?: string;
  };
  note?: string;
}

export interface TradeResult {
  symbol: string;
  side: "buy" | "sell";
  amount: number;
  price: number;
  orderId?: string;
  txSignature?: string;
  execution: ExecutionMode | "rfq";
  proof?: ExecutionProof;
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
  private proofs: ExecutionProof[] = [];

  constructor(connection: Connection, wallet: Keypair) {
    this.connection = connection;
    this.wallet = wallet;
  }

  getExecutionMode(): ExecutionMode {
    return resolveExecutionMode();
  }

  getProofs(): ExecutionProof[] {
    return [...this.proofs];
  }

  async getQuote(symbol: string): Promise<StockQuote> {
    const quote = await getPythQuote(symbol);
    const previous = this.lastPrices.get(quote.symbol);
    const changeSinceLastQuote =
      previous && previous > 0
        ? ((quote.price - previous) / previous) * 100
        : undefined;

    this.lastPrices.set(quote.symbol, quote.price);

    return {
      symbol: quote.symbol,
      price: quote.price,
      confidence: quote.confidence,
      publishTime: quote.publishTime,
      priceFeedId: quote.priceFeedId,
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

  private recordProof(proof: ExecutionProof): ExecutionProof {
    this.proofs.push(proof);
    return proof;
  }

  /**
   * Execute after the decision layer.
   * Mode is controlled by EXECUTION_MODE (paper | backpack | jupiter).
   * Default is paper so demos/CI never send doomed transactions.
   */
  async trade(symbol: string, side: "buy" | "sell", amountUsd: number): Promise<TradeResult> {
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      throw new Error("amountUsd must be greater than zero");
    }

    const mode = resolveExecutionMode();
    const quote = await this.getQuote(symbol);
    const units = amountUsd / quote.price;

    if (mode === "backpack") {
      return this.tradeBackpack(symbol, side, amountUsd, units, quote.price);
    }

    if (mode === "jupiter") {
      return this.tradeJupiter(symbol, side, amountUsd, units, quote.price);
    }

    return this.tradePaper(symbol, side, amountUsd, units, quote.price);
  }

  private tradePaper(
    symbol: string,
    side: "buy" | "sell",
    amountUsd: number,
    units: number,
    price: number
  ): TradeResult {
    if (side === "buy") {
      this.portfolio.set(symbol, (this.portfolio.get(symbol) ?? 0) + units);
    } else {
      const held = this.portfolio.get(symbol) ?? 0;
      if (held < units) throw new Error(`Insufficient ${symbol}`);
      this.portfolio.set(symbol, held - units);
    }

    console.log(
      `[Stock][PAPER] ${side.toUpperCase()} ${units.toFixed(6)} ${symbol} @ $${price.toFixed(4)} ($${amountUsd.toFixed(2)})`
    );

    const proof = this.recordProof({
      mode: "paper",
      at: new Date().toISOString(),
      symbol,
      side,
      amount: units,
      price,
      note: "Simulated fill — no on-chain or CEX order was submitted",
    });

    return {
      symbol,
      side,
      amount: units,
      price,
      execution: "paper",
      proof,
    };
  }

  private async tradeBackpack(
    symbol: string,
    side: "buy" | "sell",
    amountUsd: number,
    units: number,
    price: number
  ): Promise<TradeResult> {
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
      const proof = this.recordProof({
        mode: "backpack",
        at: new Date().toISOString(),
        symbol,
        side,
        amount: units,
        price,
        orderId: rfq.rfqId,
        note: "RFQ submitted; AUTO_ACCEPT disabled — not filled yet",
      });
      return {
        symbol,
        side,
        amount: units,
        price,
        orderId: rfq.rfqId,
        execution: "rfq",
        proof,
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

    let rfqFilled: ExecutionProof["rfqFilled"];
    try {
      const filled = await getRfqExecutionProof(rfq.rfqId);
      rfqFilled = {
        rfqId: filled.rfqId,
        status: filled.status,
        price: filled.price,
        executedQuantity: filled.executedQuantity,
        executedQuoteQuantity: filled.executedQuoteQuantity,
      };
    } catch {
      rfqFilled = { rfqId: rfq.rfqId, status: accepted.status ?? "accepted" };
    }

    const filledQty = Number(accepted.executedQuantity ?? units);
    const filledPrice = Number(accepted.price ?? bestQuote.price);

    if (side === "buy") {
      this.portfolio.set(symbol, (this.portfolio.get(symbol) ?? 0) + filledQty);
    } else {
      const held = this.portfolio.get(symbol) ?? 0;
      this.portfolio.set(symbol, Math.max(0, held - filledQty));
    }

    const proof = this.recordProof({
      mode: "backpack",
      at: new Date().toISOString(),
      symbol,
      side,
      amount: filledQty,
      price: filledPrice,
      orderId: rfq.rfqId,
      rfqFilled,
      note: "Backpack RFQ accepted",
    });

    return {
      symbol,
      side,
      amount: filledQty,
      price: filledPrice,
      orderId: rfq.rfqId,
      execution: "backpack",
      proof,
    };
  }

  private async tradeJupiter(
    symbol: string,
    side: "buy" | "sell",
    amountUsd: number,
    units: number,
    price: number
  ): Promise<TradeResult> {
    if (!hasXStockMint(symbol)) {
      throw new Error(
        `missing_xstock_mint:${symbol.toUpperCase()} — set XSTOCK_${symbol.toUpperCase()}_MINT`
      );
    }

    // buy: amount is USDC; sell: amount is stock units
    const tradeAmount = side === "buy" ? amountUsd : units;
    const result = await executeJupiterXStockTrade(
      this.connection,
      this.wallet,
      symbol,
      side,
      tradeAmount
    );

    if (side === "buy") {
      this.portfolio.set(symbol, (this.portfolio.get(symbol) ?? 0) + units);
    } else {
      const held = this.portfolio.get(symbol) ?? 0;
      this.portfolio.set(symbol, Math.max(0, held - units));
    }

    console.log(
      `[Stock][JUPITER] ${side.toUpperCase()} ${symbol} tx=${result.txSignature.slice(0, 12)}... in=${result.inputAmount} out=${result.outputAmount}`
    );

    const proof = this.recordProof({
      mode: "jupiter",
      at: new Date().toISOString(),
      symbol,
      side,
      amount: units,
      price,
      txSignature: result.txSignature,
      note: `Jupiter swap ${result.inputMint.slice(0, 8)}… → ${result.outputMint.slice(0, 8)}…`,
    });

    return {
      symbol,
      side,
      amount: units,
      price,
      txSignature: result.txSignature,
      execution: "jupiter",
      proof,
    };
  }

  async runStrategy(symbols: string[] = ["AAPL", "TSLA", "NVDA"]): Promise<number> {
    if (!hasPythApiKey()) {
      console.log("[Stock] PYTH_API_KEY missing - using deterministic paper quotes");
    }

    const mode = resolveExecutionMode();
    console.log(`[Stock] EXECUTION_MODE=${mode}`);

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
