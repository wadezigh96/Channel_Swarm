/**
 * ChannelSwarm Demo
 *
 * Shows the rarest combination on Solana right now:
 * - Payment Channels for scalable agentic payments
 * - A2A micropayments between specialized agents
 * - Stocknized Agent that trades tokenized equities
 * - Reputation feedback loop
 *
 * Run: npm run demo
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { SwarmOrchestrator } from "../src/swarm/orchestrator.js";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  ChannelSwarm — Rarest Agentic Payments Agent");
  console.log("  Built for Solana Hackathons 2026");
  console.log("═══════════════════════════════════════════════════\n");

  const rpc = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpc, "confirmed");

  // Devnet USDC (or mainnet USDC in production)
  const usdcMint = new PublicKey(
    process.env.USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
  );

  const swarm = new SwarmOrchestrator(connection, usdcMint);

  // Spin up specialized agents
  swarm.addAgent("Alpha", "general");
  swarm.addAgent("DataOracle", "data");
  swarm.addAgent("StockHunter", "stock");

  console.log("\n--- Agents online ---");
  console.table(swarm.listAgents());

  console.log("\n--- Running demo cycle ---");
  await swarm.runDemoCycle();

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Demo finished. This is the core of a winning entry.");
  console.log("  Next: wire real Payment Channels program + Meteora DBC");
  console.log("═══════════════════════════════════════════════════");
}

main().catch(console.error);
