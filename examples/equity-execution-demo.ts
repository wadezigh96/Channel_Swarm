/**
 * Tokenized-equity execution path demo
 *
 *   npm run demo:equity              # paper (default)
 *   EXECUTION_MODE=paper npm run demo:equity
 *   EXECUTION_MODE=backpack BACKPACK_LIVE_TRADING=true ... npm run demo:equity
 *   EXECUTION_MODE=jupiter USDC_MINT=... XSTOCK_AAPL_MINT=... npm run demo:equity
 *
 * Live modes require credentials and funded accounts. Paper never submits orders.
 */

import { Connection } from "@solana/web3.js";
import { StocknizedAgent } from "../src/stock/stocknized-agent.js";
import { resolveExecutionMode } from "../src/stock/execution-mode.js";
import { configuredXStockSymbols } from "../src/stock/jupiter-executor.js";
import { loadPayerFromEnv } from "../src/wallet.js";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const mode = resolveExecutionMode();
  const rpc = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpc, "confirmed");
  const wallet = loadPayerFromEnv() ?? (await import("@solana/web3.js")).Keypair.generate();

  const symbols = (process.env.STOCK_SYMBOLS ?? "AAPL,TSLA,NVDA")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  console.log(
    JSON.stringify(
      {
        demo: "equity-execution",
        executionMode: mode,
        network: rpc.includes("mainnet") ? "mainnet" : "devnet-or-custom",
        wallet: wallet.publicKey.toBase58().slice(0, 8) + "...",
        symbols,
        configuredXStockMints: configuredXStockSymbols(),
        note:
          mode === "paper"
            ? "Paper mode — fills are simulated and proofs are local only."
            : "Live mode — real API/on-chain calls will be attempted.",
      },
      null,
      2
    )
  );

  const agent = new StocknizedAgent(connection, wallet);
  const proofCapableResult = (result: Awaited<ReturnType<StocknizedAgent["trade"]>>) =>
    result as typeof result & { proof?: unknown };
  const proofCapableAgent = agent as StocknizedAgent & {
    getProofs?: () => unknown[];
  };

  for (const symbol of symbols) {
    try {
      const q1 = await agent.getQuote(symbol);
      console.log(
        JSON.stringify({ type: "quote", symbol, price: q1.price, feed: q1.priceFeedId }, null, 2)
      );

      const result = await agent.trade(
        symbol,
        "buy",
        Math.min(1, Number(process.env.DEMO_TRADE_USDC ?? "1"))
      );
      const trade = proofCapableResult(result);

      console.log(
        JSON.stringify(
          {
            type: "trade_result",
            execution: result.execution,
            symbol: result.symbol,
            side: result.side,
            amount: result.amount,
            price: result.price,
            orderId: result.orderId,
            txSignature: result.txSignature,
            proof: trade.proof,
          },
          null,
          2
        )
      );
    } catch (error) {
      console.log(
        JSON.stringify(
          {
            type: "trade_error",
            symbol,
            mode,
            error: error instanceof Error ? error.message : String(error),
          },
          null,
          2
        )
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        type: "summary",
        portfolio: agent.getPortfolio(),
        proofs: proofCapableAgent.getProofs?.() ?? [],
        executionMode: mode,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
