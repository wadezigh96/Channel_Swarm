import { Connection, Keypair } from "@solana/web3.js";
import { StocknizedAgent } from "../src/stock/stocknized-agent.js";

const rpc = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const connection = new Connection(rpc, "confirmed");
const wallet = Keypair.generate();

const agent = new StocknizedAgent(connection, wallet);
const symbols = (process.env.STOCK_SYMBOLS ?? "AAPL,TSLA,NVDA")
  .split(",")
  .map((symbol) => symbol.trim().toUpperCase())
  .filter(Boolean);

console.log(JSON.stringify({
  demo: "STOCKLANA",
  network: "solana-mainnet",
  liveTradingEnabled: process.env.BACKPACK_LIVE_TRADING === "true",
  symbols,
  executionProof: "No transaction is claimed unless Backpack returns an execution result.",
}, null, 2));

for (const symbol of symbols) {
  try {
    const decision = await agent.decide(symbol);
    console.log(JSON.stringify({
      type: "agent_decision",
      ...decision,
    }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({
      type: "agent_error",
      symbol,
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
  }
}

console.log(JSON.stringify({
  type: "portfolio",
  value: agent.getPortfolio(),
}));
