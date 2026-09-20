import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import {
  PAYMENT_CHANNELS_PROGRAM_ID,
  VOUCHER_MAGIC,
  VOUCHER_SIZE,
} from "./channel-manager.js";
import { encodeOpenData, buildSettleAndSealInstruction } from "./instructions.js";

test("official program id matches mainnet", () => {
  assert.equal(
    PAYMENT_CHANNELS_PROGRAM_ID.toBase58(),
    "CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX"
  );
});

test("voucher wire format is 50 bytes with magic V\\x01", () => {
  const channel = Keypair.generate().publicKey;
  const msg = new Uint8Array(VOUCHER_SIZE);
  msg.set(VOUCHER_MAGIC, 0);
  msg.set(channel.toBytes(), 2);
  const view = new DataView(msg.buffer);
  view.setBigUint64(34, 40_000n, true);
  view.setBigInt64(42, 0n, true);

  assert.equal(msg.length, 50);
  assert.equal(msg[0], 0x56);
  assert.equal(msg[1], 0x01);
  assert.deepEqual(msg.slice(2, 34), channel.toBytes());
  assert.equal(view.getBigUint64(34, true), 40_000n);
});

test("ed25519 signature verifies against payer secret", () => {
  const payer = Keypair.generate();
  const msg = new Uint8Array(50);
  msg.set(VOUCHER_MAGIC, 0);
  const sig = nacl.sign.detached(msg, payer.secretKey);
  assert.equal(nacl.sign.detached.verify(msg, sig, payer.publicKey.toBytes()), true);
});

test("open instruction data starts with discriminator 1", () => {
  const data = encodeOpenData({
    salt: 1n,
    deposit: 5_000_000n,
    gracePeriod: 900,
    openSlot: 100n,
    recipients: [],
  });
  assert.equal(data[0], 1);
  assert.equal(data.readBigUInt64LE(1), 1n);
  assert.equal(data.readBigUInt64LE(9), 5_000_000n);
  assert.equal(data.readUInt32LE(17), 900);
  assert.equal(data.readUInt32LE(29), 0);
});

test("pda seeds are deterministic", () => {
  const payer = Keypair.generate().publicKey;
  const payee = Keypair.generate().publicKey;
  const mint = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
  const saltBuf = Buffer.alloc(8);
  saltBuf.writeBigUInt64LE(42n);
  const slotBuf = Buffer.alloc(8);
  slotBuf.writeBigUInt64LE(99n);
  const [a] = PublicKey.findProgramAddressSync(
    [Buffer.from("channel"), payer.toBuffer(), payee.toBuffer(), mint.toBuffer(), payer.toBuffer(), saltBuf, slotBuf],
    PAYMENT_CHANNELS_PROGRAM_ID
  );
  const [b] = PublicKey.findProgramAddressSync(
    [Buffer.from("channel"), payer.toBuffer(), payee.toBuffer(), mint.toBuffer(), payer.toBuffer(), saltBuf, slotBuf],
    PAYMENT_CHANNELS_PROGRAM_ID
  );
  assert.equal(a.toBase58(), b.toBase58());
});


test("settleAndSeal instruction uses discriminator 4 and voucher flag", () => {
  const channel = Keypair.generate().publicKey;
  const payee = Keypair.generate().publicKey;

  const withVoucher = buildSettleAndSealInstruction(payee, channel, true);
  const withoutVoucher = buildSettleAndSealInstruction(payee, channel, false);
  assert.equal(withVoucher.data[0], 4);
  assert.equal(withVoucher.data[1], 1);
  assert.equal(withoutVoucher.data[0], 4);
  assert.equal(withoutVoucher.data[1], 0);
});
