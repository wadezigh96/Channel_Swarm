/**
 * ChannelSwarm demo — devnet simulation by default
 *
 * Requires:
 *   Optional: SOLANA_PRIVATE_KEY for explicit devnet on-chain testing
 *   Optional: PAYPAL_CLIENT_ID + SECRET for separate PayPal sandbox checkout
 *
 * Defaults:
 *   Network: devnet
 *   Asset:   PYUSD devnet mint
 *   Mode:    simulation (ONCHAIN=false)
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { SwarmOrchestrator } from "../src/swarm/orchestrator.js";
import { loadPayerFromEnv, isOnchainMode, requirePayer } from "../src/wallet.js";
import { getPyusdMint, getPyusdNetwork, getPyusdRpcUrl, PYUSD_INFO } from "../src/payments/pyusd.js";
import * as dotenv from "dotenv";

dotenv.config();

function banner(onchain: boolean, usePyusd: boolean) {
  console.log("");
  console.log("═".repeat(55));
  console.log("  ChannelSwarm — Agentic Payments on Solana");
  console.log(`  Mode: ${onchain ? "ON-CHAIN (real)" : "SIMULATION"}`);
  if (usePyusd) {
    console.log(`  Asset: PYUSD (${PYUSD_INFO.symbol}) — ${getPyusdNetwork()}`);
  }
  console.log("═".repeat(55));
  console.log("");
}

async function main() {
  const onchain = isOnchainMode();
  const usePyusd = (process.env.USE_PYUSD ?? "true") === "true";
  const network = usePyusd ? getPyusdNetwork() : (process.env.NETWORK || "devnet").toLowerCase();
  banner(onchain, usePyusd);

  const rpc = usePyusd ? getPyusdRpcUrl() : process.env.SOLANA_RPC_URL || (network === "mainnet" || network === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : network === "testnet" ? "https://api.testnet.solana.com" : "https://api.devnet.solana.com");
  const connection = new Connection(rpc, "confirmed");

  const mint = usePyusd
    ? getPyusdMint()
    : new PublicKey(
        process.env.USDC_MINT || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
      );

  if (usePyusd) {
    console.log(`[PYUSD] Using ${PYUSD_INFO.name} mint: ${mint.toBase58()}`);
    console.log(`[PYUSD] Network: ${getPyusdNetwork()}`);
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
    throw new Error("ONCHAIN=true but SOLANA_PRIVATE_KEY is missing. Real on-chain transactions require a funded wallet.");
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

  console.log(`\n--- Running demo cycle (${network}) ---`);
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
  console.log("  PayPal is a separate checkout rail; it is never charged automatically after Solana settlement.");
  console.log("  Dashboard: https://swarm-agent-beta.vercel.app/");
  console.log("═".repeat(55) + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
