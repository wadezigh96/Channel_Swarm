import test from "node:test";
import assert from "node:assert/strict";
import { isOnchainMode } from "./wallet.js";

test("on-chain mode is opt-in and simulation is the default", () => {
  const original = process.env.ONCHAIN;
  try {
    delete process.env.ONCHAIN;
    assert.equal(isOnchainMode(), false);
    process.env.ONCHAIN = "false";
    assert.equal(isOnchainMode(), false);
    process.env.ONCHAIN = "true";
    assert.equal(isOnchainMode(), true);
    process.env.ONCHAIN = "1";
    assert.equal(isOnchainMode(), true);
  } finally {
    if (original === undefined) delete process.env.ONCHAIN;
    else process.env.ONCHAIN = original;
  }
});
