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


test("x402 payment header decodes and verifies", async () => {
  const { decodePaymentHeader, verifyPayment } = await import("../../examples/x402-demo.js");
  const payer = Keypair.generate();
  const message = new Uint8Array(50);
  message.set(VOUCHER_MAGIC, 0);
  const signature = nacl.sign.detached(message, payer.secretKey);
  const header = Buffer.concat([Buffer.from(message), Buffer.from(signature)]).toString("base64");
  const decoded = decodePaymentHeader(header);
  assert.equal(decoded.message.length, 50);
  assert.equal(decoded.signature.length, 64);
  verifyPayment(header, payer.publicKey);
});


test("x402 payment verification rejects insufficient payment and replay", async () => {
  const { createX402DemoServer } = await import("../../examples/x402-demo.js");
  const payer = Keypair.generate();
  const payee = Keypair.generate();
  const connection = { getSlot: async () => 1 } as any;
  const { ChannelManager } = await import("./channel-manager.js");
  const manager = new ChannelManager({
    connection,
    payer,
    usdcMint: new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
  });
  const channelId = await manager.openChannel({ counterparty: payee.publicKey, ceilingUsdc: 1, salt: 403n });
  const voucher = await manager.createVoucher(channelId, 0.001);
  const header = Buffer.concat([Buffer.from(voucher.message), Buffer.from(voucher.signature)]).toString("base64");
  const server = createX402DemoServer(manager, channelId, payer, 0.002);
  const port = 4199;
  await new Promise<void>((resolve) => server.listen(port, resolve));
  const insufficient = await fetch("http://127.0.0.1:" + port + "/resource", { headers: { "x-payment": header } });
  assert.equal(insufficient.status, 402);
  await manager.createVoucher(channelId, 0.002);
  const fresh = await manager.getVoucher(channelId);
  assert.ok(fresh);
  const freshHeader = Buffer.concat([Buffer.from(fresh!.message), Buffer.from(fresh!.signature)]).toString("base64");
  const accepted = await fetch("http://127.0.0.1:" + port + "/resource", { headers: { "x-payment": freshHeader } });
  assert.equal(accepted.status, 200);
  const replay = await fetch("http://127.0.0.1:" + port + "/resource", { headers: { "x-payment": freshHeader } });
  assert.equal(replay.status, 402);
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
