/**
 * ChannelSwarm demo
 *
 *   npm run demo              # simulation (default)
 *   ONCHAIN=true npm run demo # send real txs if wallet is funded
 *   USE_PYUSD=true npm run demo  # use official PYUSD mint instead of USDC
 *
 * Dual-rail: if PAYPAL_CLIENT_ID + SECRET are set, a PayPal order is created
 * automatically after the Solana channel settles.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { SwarmOrchestrator } from "../src/swarm/orchestrator.js";
import { loadPayerFromEnv, isOnchainMode } from "../src/wallet.js";
import { getPyusdMint, PYUSD_INFO } from "../src/payments/pyusd.js";
import * as dotenv from "dotenv";

dotenv.config();

function banner(onchain: boolean, usePyusd: boolean) {
  console.log("");
  console.log("═".repeat(55));
  console.log("  ChannelSwarm — Agentic Payments on Solana");
  console.log(`  Mode: ${onchain ? "ON-CHAIN" : "SIMULATION"}`);
  if (usePyusd) {
    console.log(`  Asset: PYUSD (${PYUSD_INFO.symbol}) — ${getPyusdMint().toBase58().slice(0, 8)}...`);
  }
  console.log("═".repeat(55));
  console.log("");
}

async function main() {
  const onchain = isOnchainMode();
  const usePyusd = process.env.USE_PYUSD === "true";
  banner(onchain, usePyusd);

  const rpc = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpc, "confirmed");

  const mint = usePyusd
    ? getPyusdMint()
    : new PublicKey(
        process.env.USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
      );

  if (usePyusd) {
    console.log(`[PYUSD] Using ${PYUSD_INFO.name} mint: ${mint.toBase58()}`);
    console.log(`[PYUSD] Network: ${process.env.PYUSD_NETWORK || process.env.NETWORK || "devnet"}`);
  }

  const swarm = new SwarmOrchestrator(connection, mint, onchain);
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
  if (result.paypalOrderId) {
    console.log(`  Dual-rail PayPal order: ${result.paypalOrderId}`);
    if (result.paypalApproveUrl) {
      console.log(`  Approve: ${result.paypalApproveUrl}`);
    }
  }
  console.log("  Dashboard: https://swarm-agent-beta.vercel.app/");
  if (!onchain) {
    console.log("  To attempt real txs: ONCHAIN=true SOLANA_PRIVATE_KEY=... npm run demo");
  }
  if (usePyusd) {
    console.log("  PYUSD mode: fund payer with devnet PYUSD (faucet.paxos.com)");
  }
  console.log("═".repeat(55) + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
