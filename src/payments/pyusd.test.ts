import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import {
  MEMO_PROGRAM_ID,
  PYUSD_MAINNET_MINT,
  buildPyusdTransferTransaction,
  parsePyusdAmount,
  verifyPyusdParsedTransaction,
} from "./pyusd.js";

test("PYUSD uses exact USD decimal conversion with six token decimals", () => {
  assert.equal(parsePyusdAmount("1.00"), 1_000_000n);
  assert.equal(parsePyusdAmount("0.01"), 10_000n);
  assert.equal(parsePyusdAmount("123.45"), 123_450_000n);
  assert.throws(() => parsePyusdAmount("0.001"), /amount_must/);
  assert.throws(() => parsePyusdAmount("10001.00"), /amount_out_of_range/);
});

test("PYUSD payment transaction uses Token-2022 and fixed Mainnet mint", () => {
  const payer = Keypair.generate().publicKey;
  const recipient = Keypair.generate().publicKey;
  const tx = buildPyusdTransferTransaction({
    payer, recipient, amountAtomic: 2_500_000n,
    requestId: "f1c49c72-2c2b-43cc-8d34-8a10e47b64d8",
    blockhash: Keypair.generate().publicKey.toBase58(),
  });
  assert.equal(tx.feePayer?.toBase58(), payer.toBase58());
  assert.equal(tx.instructions[1].programId.toBase58(), MEMO_PROGRAM_ID.toBase58());
  assert.equal(tx.instructions[2].programId.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58());
  assert.equal(PYUSD_MAINNET_MINT.toBase58(), "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo");
});

test("PYUSD verifier accepts only the exact payer, recipient, mint, amount and memo", () => {
  const payer = Keypair.generate().publicKey;
  const recipient = Keypair.generate().publicKey;
  const amountAtomic = 4_250_000n;
  const requestId = "f1c49c72-2c2b-43cc-8d34-8a10e47b64d8";
  const source = getAssociatedTokenAddressSync(PYUSD_MAINNET_MINT, payer, false, TOKEN_2022_PROGRAM_ID);
  const destination = getAssociatedTokenAddressSync(PYUSD_MAINNET_MINT, recipient, false, TOKEN_2022_PROGRAM_ID);
  const tx = {
    meta: { err: null, innerInstructions: [] },
    transaction: {
      message: {
        accountKeys: [{ pubkey: payer, signer: true }],
        instructions: [
          {
            programId: MEMO_PROGRAM_ID,
            parsed: `channelswarm:pyusd:${requestId}`,
          },
          {
            programId: TOKEN_2022_PROGRAM_ID,
            parsed: {
              type: "transferChecked",
              info: {
                source: source.toBase58(),
                destination: destination.toBase58(),
                authority: payer.toBase58(),
                mint: PYUSD_MAINNET_MINT.toBase58(),
                tokenAmount: { amount: amountAtomic.toString(), decimals: 6, uiAmountString: "4.25" },
              },
            },
          },
        ],
      },
    },
  };
  const result = verifyPyusdParsedTransaction(tx, { payer, recipient, amountAtomic, requestId });
  assert.equal(result.verified, true);
  assert.equal(result.status, "finalized");
  assert.equal(result.asset, "PYUSD");
  assert.throws(() => verifyPyusdParsedTransaction(tx, {
    payer, recipient, amountAtomic: 5_000_000n, requestId,
  }), /does_not_match/);
  assert.throws(() => verifyPyusdParsedTransaction(tx, {
    payer, recipient, amountAtomic, requestId: "00000000-0000-4000-8000-000000000000",
  }), /reference_mismatch/);
});
