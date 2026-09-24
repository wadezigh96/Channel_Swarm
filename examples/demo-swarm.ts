/**
 * ChannelSwarm demo
 *
 *   npm run demo              # simulation (default)
 *   ONCHAIN=true npm run demo # send real txs if wallet is funded
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { SwarmOrchestrator } from "../src/swarm/orchestrator.js";
import { loadPayerFromEnv, isOnchainMode } from "../src/wallet.js";
import * as dotenv from "dotenv";

dotenv.config();

function banner(onchain: boolean) {
  console.log("");
  console.log("═".repeat(55));
  console.log("  ChannelSwarm — Agentic Payments on Solana");
  console.log(`  Mode: ${onchain ? "ON-CHAIN" : "SIMULATION"}`);
  console.log("═".repeat(55));
  console.log("");
}

async function main() {
  const onchain = isOnchainMode();
  banner(onchain);

  const rpc = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpc, "confirmed");

  const usdcMint = new PublicKey(
    process.env.USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
  );

  const swarm = new SwarmOrchestrator(connection, usdcMint, onchain);
  const reputation = swarm.getReputation();

  const fundedPayer = loadPayerFromEnv();
  const alpha = swarm.addAgent("Alpha", "general", fundedPayer ?? undefined);
  const data = swarm.addAgent("DataOracle", "data");
  const stock = swarm.addAgent("StockHunter", "stock");

  if (onchain && !fundedPayer) {
    console.warn(
      "[Warn] ONCHAIN=true but SOLANA_PRIVATE_KEY is missing — Alpha uses an ephemeral keypair."
    );
    console.warn("[Warn] Channel open will fall back to simulation unless that key is funded.");
  }

  console.log("\n--- Agents online ---");
  console.table(
    swarm.listAgents().map((a) => ({
      name: a.name,
      role: a.role,
      reputation: a.reputation.toFixed(2),
      pubkey: a.pubkey.slice(0, 8) + "...",
    }))
  );

  if (!reputation.canOpenChannel(data.name, 0.5)) {
    console.error("DataOracle reputation too low — refusing to open channel");
    return;
  }

  console.log("\n--- Running demo cycle ---");
  const result = await swarm.runDemoCycle();

  console.log("\n--- Final Reputation Leaderboard ---");
  console.table(
    reputation.list().map((r) => ({
      agent: r.agentId,
      score: r.score.toFixed(2),
      settlements: r.successfulSettlements,
      volumeUSDC: r.totalVolumeUsdc.toFixed(4),
    }))
  );

  console.log("\n" + "═".repeat(55));
  console.log("  Demo complete.");
  console.log("  Dashboard: https://wadezigh96.github.io/Swarm_Agent/index.html");
  if (!onchain) {
    console.log("  To attempt real txs: ONCHAIN=true SOLANA_PRIVATE_KEY=... npm run demo");
  }
  console.log("═".repeat(55) + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
