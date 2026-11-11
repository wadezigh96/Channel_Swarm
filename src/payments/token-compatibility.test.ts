import test from "node:test";
import assert from "node:assert/strict";
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { buildOpenInstruction } from "./instructions.js";
import { findUnsupportedChannelMintExtensions } from "./token-compatibility.js";

test("Payment Channels accepts only transfer-neutral Token-2022 mint extensions", () => {
  assert.deepEqual(
    findUnsupportedChannelMintExtensions([
      ExtensionType.MetadataPointer,
      ExtensionType.TokenMetadata,
      ExtensionType.GroupPointer,
    ]),
    []
  );
  assert.deepEqual(
    findUnsupportedChannelMintExtensions([
      ExtensionType.TransferFeeConfig,
      ExtensionType.PermanentDelegate,
      ExtensionType.TransferHook,
    ]),
    [ExtensionType.TransferFeeConfig, ExtensionType.PermanentDelegate, ExtensionType.TransferHook]
  );
});

test("open instruction passes Token-2022 and derives its Token-2022 ATAs", () => {
  const payer = Keypair.generate().publicKey;
  const rentPayer = payer;
  const payee = Keypair.generate().publicKey;
  const mint = Keypair.generate().publicKey;
  const channel = Keypair.generate().publicKey;
  const ix = buildOpenInstruction({
    payer,
    rentPayer,
    payee,
    mint,
    authorizedSigner: payer,
    channel,
    salt: 1n,
    deposit: 1_000_000n,
    gracePeriod: 900,
    openSlot: 1n,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  });
  assert.ok(ix.keys[8].pubkey.equals(TOKEN_2022_PROGRAM_ID));
  assert.ok(ix.keys[6].pubkey.equals(getAssociatedTokenAddressSync(mint, payer, false, TOKEN_2022_PROGRAM_ID)));
  assert.ok(ix.keys[7].pubkey.equals(getAssociatedTokenAddressSync(mint, channel, true, TOKEN_2022_PROGRAM_ID)));
  assert.ok(!ix.keys[6].pubkey.equals(getAssociatedTokenAddressSync(mint, payer, false, TOKEN_PROGRAM_ID)));
});

test("open instruction rejects unrelated token program IDs", () => {
  assert.throws(() => buildOpenInstruction({
    payer: Keypair.generate().publicKey,
    rentPayer: Keypair.generate().publicKey,
    payee: Keypair.generate().publicKey,
    mint: Keypair.generate().publicKey,
    authorizedSigner: Keypair.generate().publicKey,
    channel: Keypair.generate().publicKey,
    salt: 1n,
    deposit: 1n,
    gracePeriod: 1,
    openSlot: 1n,
    tokenProgram: new PublicKey("11111111111111111111111111111111"),
  }), /unsupported_token_program/);
});
