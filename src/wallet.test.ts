import assert from "node:assert/strict";
import { test } from "node:test";
import { isOnchainMode } from "./wallet.js";

const keys = ["ONCHAIN", "NETWORK", "ALLOW_MAINNET_TRANSACTIONS"] as const;
function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) {
      if (values[key] === undefined) delete process.env[key];
      else process.env[key] = values[key]!;
    }
    run();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key]!;
    }
  }
}

test("on-chain mode defaults to disabled", () => withEnv({}, () => assert.equal(isOnchainMode(), false)));
test("devnet requires explicit ONCHAIN=true", () => withEnv({ ONCHAIN: "true", NETWORK: "devnet" }, () => assert.equal(isOnchainMode(), true)));
test("mainnet is locked without separate acknowledgement", () => withEnv({ ONCHAIN: "true", NETWORK: "mainnet" }, () => assert.throws(() => isOnchainMode(), /Mainnet transactions are locked/)));
test("mainnet can only pass the explicit guard", () => withEnv({ ONCHAIN: "true", NETWORK: "mainnet", ALLOW_MAINNET_TRANSACTIONS: "true" }, () => assert.equal(isOnchainMode(), true)));
test("unknown networks are rejected", () => withEnv({ ONCHAIN: "true", NETWORK: "localnet" }, () => assert.throws(() => isOnchainMode(), /Unsupported Solana NETWORK/)));
