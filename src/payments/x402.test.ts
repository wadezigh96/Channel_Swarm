import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import {
  decodePaymentHeader,
  paymentRequirement,
  verifyPayment,
} from "./x402-server.js";

test("paymentRequirement describes the channel-voucher scheme", () => {
  assert.deepEqual(paymentRequirement(0.002), {
    scheme: "channel-voucher",
    network: "solana",
    priceUsdc: 0.002,
    paymentHeader: "x-payment",
  });
});

test("decodePaymentHeader decodes a 50-byte message and 64-byte signature", () => {
  const message = new Uint8Array(50);
  message[0] = 0x56;
  message[1] = 0x01;
  const signature = new Uint8Array(64);
  const encoded = Buffer.from(Buffer.concat([Buffer.from(message), Buffer.from(signature)])).toString("base64");

  const decoded = decodePaymentHeader(encoded);

  assert.equal(decoded.message.length, 50);
  assert.equal(decoded.signature.length, 64);
  assert.equal(decoded.message[0], 0x56);
  assert.equal(decoded.message[1], 0x01);
});

test("decodePaymentHeader rejects malformed payment length", () => {
  const encoded = Buffer.from(new Uint8Array(113)).toString("base64");
  assert.throws(() => decodePaymentHeader(encoded), /invalid_payment_length/);
});

test("verifyPayment accepts a valid Ed25519 payment", () => {
  const payer = Keypair.generate();
  const message = new Uint8Array(50);
  message[0] = 0x56;
  message[1] = 0x01;
  const signature = nacl.sign.detached(message, payer.secretKey);
  const encoded = Buffer.concat([Buffer.from(message), Buffer.from(signature)]).toString("base64");

  const verified = verifyPayment(encoded, payer.publicKey);

  assert.deepEqual(Array.from(verified.message), Array.from(message));
  assert.deepEqual(Array.from(verified.signature), Array.from(signature));
});

test("verifyPayment rejects a signature from the wrong payer", () => {
  const payer = Keypair.generate();
  const wrongPayer = Keypair.generate();
  const message = new Uint8Array(50);
  message[0] = 0x56;
  message[1] = 0x01;
  const signature = nacl.sign.detached(message, payer.secretKey);
  const encoded = Buffer.concat([Buffer.from(message), Buffer.from(signature)]).toString("base64");

  assert.throws(
    () => verifyPayment(encoded, wrongPayer.publicKey),
    /invalid_signature/
  );
});

test("verifyPayment rejects a tampered message", () => {
  const payer = Keypair.generate();
  const message = new Uint8Array(50);
  message[0] = 0x56;
  message[1] = 0x01;
  const signature = nacl.sign.detached(message, payer.secretKey);
  message[10] ^= 0xff;
  const encoded = Buffer.concat([Buffer.from(message), Buffer.from(signature)]).toString("base64");

  assert.throws(
    () => verifyPayment(encoded, payer.publicKey),
    /invalid_signature/
  );
});

test("x402 payment header has the expected base64 wire length", () => {
  const payer = Keypair.generate();
  const message = new Uint8Array(50);
  const signature = nacl.sign.detached(message, payer.secretKey);
  const encoded = Buffer.concat([Buffer.from(message), Buffer.from(signature)]).toString("base64");

  assert.equal(Buffer.from(encoded, "base64").length, 114);
  assert.equal(new PublicKey(payer.publicKey).toBase58(), payer.publicKey.toBase58());
});
