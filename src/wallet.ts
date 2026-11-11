import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

/**
 * Load a payer keypair from SOLANA_PRIVATE_KEY.
 * Accepts base58 secret or JSON array of 64 bytes.
 */
export function loadPayerFromEnv(): Keypair | null {
  const raw = process.env.SOLANA_PRIVATE_KEY?.trim();
  if (!raw || raw === "your_base58_private_key_here") return null;

  try {
    if (raw.startsWith("[")) {
      const arr = JSON.parse(raw) as number[];
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    }
    return Keypair.fromSecretKey(bs58.decode(raw));
  } catch (err) {
    console.warn("[Wallet] Failed to parse SOLANA_PRIVATE_KEY:", (err as Error).message);
    return null;
  }
}

export function requirePayer(): Keypair {
  const kp = loadPayerFromEnv();
  if (!kp) {
    throw new Error(
      "SOLANA_PRIVATE_KEY missing or invalid. Required for mainnet transactions."
    );
  }
  return kp;
}

/** Real transactions require an explicit ONCHAIN=true opt-in. */
export function isOnchainMode(): boolean {
  return (process.env.ONCHAIN ?? "false").toLowerCase() === "true" || process.env.ONCHAIN === "1";
}
