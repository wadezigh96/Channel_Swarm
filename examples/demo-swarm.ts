/**
 * ChannelSwarm Full Demo
 *
 * Run: npm run demo
 *
 * This demo shows judges the complete rare combination:
 * 1. Payment Channels opened between agents
 * 2. High-frequency off-chain vouchers (x402 style)
 * 3. Stocknized Agent trading tokenized equities
 * 4. Reputation updates after settlement
 * 5. Self-funding narrative (stock profits → channels)
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { SwarmOrchestrator } from "../src/swarm/orchestrator.js";
import { ReputationRegistry } from "../src/reputation/reputation.js";
import * as dotenv from "dotenv";

dotenv.config();

function banner() {
  console.log("");
  console.log("═══════════════════════════════════════════════════");
  console.log("  ChannelSwarm — Rarest Agentic Payments Agent");
  console.log("  Built for Solana Hackathons 2026");
  console.log("  Payment Channels + A2A + Stocknized Agents");
  console.log("═══════════════════════════════════════════════════");
  console.log("");
}

async function main() {
  banner();

  const rpc = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpc, "confirmed");

  // Devnet USDC (change for mainnet)
  const usdcMint = new PublicKey(
    process.env.USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
  );

  const swarm = new SwarmOrchestrator(connection, usdcMint);
  const reputation = new ReputationRegistry();

  // Spin up specialized agents
  const alpha = swarm.addAgent("Alpha", "general");
  const data = swarm.addAgent("DataOracle", "data");
  const stock = swarm.addAgent("StockHunter", "stock");

  reputation.register(alpha.name);
  reputation.register(data.name);
  reputation.register(stock.name);

  console.log("\n--- Agents online ---");
  console.table(
    swarm.listAgents().map((a) => ({
      name: a.name,
      role: a.role,
      reputation: reputation.get(a.name)?.score.toFixed(2),
      pubkey: a.pubkey.slice(0, 8) + "...",
    }))
  );

  // Safety check: only open channel if counterparty has decent reputation
  if (!reputation.canOpenChannel(data.name, 0.5)) {
    console.error("DataOracle reputation too low — refusing to open channel");
    return;
  }

  console.log("\n--- Running full demo cycle ---");
  const result = await swarm.runDemoCycle();

  // Update reputation after successful settlement
  reputation.recordSuccess(data.name, result.claimed);
  reputation.recordSuccess(alpha.name, result.claimed * 0.4);

  console.log("\n--- Final Reputation Leaderboard ---");
  console.table(
    reputation.list().map((r) => ({
      agent: r.agentId,
      score: r.score.toFixed(2),
      settlements: r.successfulSettlements,
      volumeUSDC: r.totalVolumeUsdc.toFixed(4),
    }))
  );

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Demo complete.");
  console.log("  Open dashboard/index.html for the visual view.");
  console.log("  See SUBMISSION.md for ready-to-copy hackathon text.");
  console.log("═══════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
