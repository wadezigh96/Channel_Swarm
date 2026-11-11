/**
 * Official PayPal USD (PYUSD) mint addresses on Solana.
 *
 * PYUSD is a Token-2022 token issued by Paxos for PayPal.
 * Decimals: 6
 *
 * Sources:
 * - https://solana.com/pyusd
 * - https://docs.paxos.com/guides/stablecoin/pyusd/mainnet
 * - https://docs.paxos.com/guides/stablecoin/pyusd/testnet
 */

import { PublicKey } from "@solana/web3.js";

/** Mainnet PYUSD mint (Token-2022) */
export const PYUSD_MINT_MAINNET = new PublicKey(
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo"
);

/** Devnet PYUSD mint (Token-2022) */
export const PYUSD_MINT_DEVNET = new PublicKey(
  "CXk2AMBfi3TwaEL2468s6zP8xq9NxTXjp9gjMgzeUynM"
);

export type PyusdNetwork = "devnet" | "mainnet";

/** Resolve the canonical PYUSD network. Mainnet must be selected explicitly. */
export function getPyusdNetwork(): PyusdNetwork {
  const network = (process.env.PYUSD_NETWORK || process.env.NETWORK || "devnet").toLowerCase();
  if (network === "devnet") return "devnet";
  if (network === "mainnet" || network === "mainnet-beta") return "mainnet";
  throw new Error(`Unsupported PYUSD_NETWORK: ${network}`);
}

/** Resolve the RPC endpoint for the selected PYUSD network. */
export function getPyusdRpcUrl(): string {
  if (process.env.SOLANA_RPC_URL) return process.env.SOLANA_RPC_URL;
  return getPyusdNetwork() === "mainnet"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";
}

/**
 * Resolve PYUSD mint based on environment.
 * Defaults to devnet. Mainnet must be selected explicitly.
 */
export function getPyusdMint(): PublicKey {
  return getPyusdNetwork() === "mainnet" ? PYUSD_MINT_MAINNET : PYUSD_MINT_DEVNET;
}

/** Human-readable info */
export const PYUSD_INFO = {
  symbol: "PYUSD",
  name: "PayPal USD",
  decimals: 6,
  program: "Token-2022",
  issuer: "Paxos Trust Company (for PayPal)",
  mainnet: PYUSD_MINT_MAINNET.toBase58(),
  devnet: PYUSD_MINT_DEVNET.toBase58(),
};
