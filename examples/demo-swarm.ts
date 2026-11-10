/**
 * ChannelSwarm demo — mainnet real transactions
 *
 * Requires:
 *   SOLANA_PRIVATE_KEY  (funded with SOL + PYUSD)
 *   Optional: PAYPAL_CLIENT_ID + SECRET for dual-rail
 *
 * Defaults:
 *   Network: mainnet-beta
 *   Asset:   PYUSD (2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo)
 *   Mode:    ONCHAIN=true (real txs)
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { SwarmOrchestrator } from "../src/swarm/orchestrator.js";
import { loadPayerFromEnv, isOnchainMode, requirePayer } from "../src/wallet.js";
import { getPyusdMint, PYUSD_INFO } from "../src/payments/pyusd.js";
import * as dotenv from "dotenv";

dotenv.config();

function banner(onchain: boolean, usePyusd: boolean) {
  console.log("");
  console.log("═".repeat(55));
  console.log("  ChannelSwarm — Agentic Payments on Solana MAINNET");
  console.log(`  Mode: ${onchain ? "ON-CHAIN (real)" : "SIMULATION"}`);
  if (usePyusd) {
    console.log(`  Asset: PYUSD (${PYUSD_INFO.symbol}) — mainnet`);
  }
  console.log("═".repeat(55));
  console.log("");
}

async function main() {
  const onchain = isOnchainMode();
  const usePyusd = (process.env.USE_PYUSD ?? "true") === "true";
  banner(onchain, usePyusd);

  const rpc = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  const connection = new Connection(rpc, "confirmed");

  const mint = usePyusd
    ? getPyusdMint()
    : new PublicKey(
        process.env.USDC_MINT || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
      );

  if (usePyusd) {
    console.log(`[PYUSD] Using ${PYUSD_INFO.name} mint: ${mint.toBase58()}`);
    console.log(`[PYUSD] Network: mainnet`);
  }

  if (onchain) {
    const payer = requirePayer();
    console.log(`[Wallet] Payer: ${payer.publicKey.toBase58()}`);
  }

  const swarm = new SwarmOrchestrator(connection, mint, onchain);
  const reputation = swarm.getReputation();

  const fundedPayer = loadPayerFromEnv();
  const alpha = swarm.addAgent("Alpha", "general", fundedPayer ?? undefined);
  const data = swarm.addAgent("DataOracle", "data");
  const stock = swarm.addAgent("StockHunter", "stock");

  if (onchain && !fundedPayer) {
    throw new Error("ONCHAIN=true but SOLANA_PRIVATE_KEY is missing. Real mainnet transactions require a funded wallet.");
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

  console.log("\n--- Running demo cycle (mainnet) ---");
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
  if (result.signature) {
    console.log(`  On-chain signature: ${result.signature}`);
    console.log(`  Explorer: https://explorer.solana.com/tx/${result.signature}`);
  }
  if (result.paypalOrderId) {
    console.log(`  Dual-rail PayPal order: ${result.paypalOrderId}`);
    if (result.paypalApproveUrl) {
      console.log(`  Approve: ${result.paypalApproveUrl}`);
    }
  }
  console.log("  Dashboard: https://swarm-agent-beta.vercel.app/");
  console.log("═".repeat(55) + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
