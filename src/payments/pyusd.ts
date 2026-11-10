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

/**
 * Resolve PYUSD mint based on environment.
 * Defaults to mainnet. Set PYUSD_NETWORK=devnet to override.
 */
export function getPyusdMint(): PublicKey {
  const network = (process.env.PYUSD_NETWORK || process.env.NETWORK || "mainnet").toLowerCase();
  if (network === "devnet") {
    return PYUSD_MINT_DEVNET;
  }
  return PYUSD_MINT_MAINNET;
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
