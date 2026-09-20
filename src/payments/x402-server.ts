import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import { Keypair, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import { VOUCHER_MAGIC, type ChannelManager } from "./channel-manager.js";

export interface X402PaymentRequirement {
  scheme: "channel-voucher";
  network: "solana";
  priceUsdc: number;
  paymentHeader: "x-payment";
}

export interface VerifiedX402Payment {
  message: Uint8Array;
  signature: Uint8Array;
  cumulativeUsdc: number;
}

export function paymentRequirement(priceUsdc: number): X402PaymentRequirement {
  return {
    scheme: "channel-voucher",
    network: "solana",
    priceUsdc,
    paymentHeader: "x-payment",
  };
}

export function decodePaymentHeader(value: string): { message: Uint8Array; signature: Uint8Array } {
  const raw = Buffer.from(value, "base64");
  if (raw.length !== 114) {
    throw new Error("invalid_payment_length");
  }
  return { message: raw.subarray(0, 50), signature: raw.subarray(50) };
}

export function verifyPayment(
  value: string,
  expectedPublicKey: PublicKey
): { message: Uint8Array; signature: Uint8Array } {
  const { message, signature } = decodePaymentHeader(value);
  if (!nacl.sign.detached.verify(message, signature, expectedPublicKey.toBytes())) {
    throw new Error("invalid_signature");
  }
  return { message, signature };
}

export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

export function createX402DemoServer(
  manager: ChannelManager,
  channelId: string,
  payer: Keypair,
  priceUsdc: number
) {
  let highestCumulativeUsdc = 0;
  let acceptedPayments = 0;

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url !== "/resource" || req.method !== "GET") {
      sendJson(res, 404, { error: "not_found" });
      return;
    }

    const auth = req.headers["x-payment"];
    if (typeof auth !== "string") {
      sendJson(
        res,
        402,
        { error: "payment_required", ...paymentRequirement(priceUsdc) },
        { "x-payment-required": JSON.stringify(paymentRequirement(priceUsdc)) }
      );
      return;
    }

    try {
      const verified = verifyPayment(auth, payer.publicKey);
      const channel = manager.getChannelState(channelId);
      if (!channel) throw new Error("channel_not_found");

      const message = verified.message;
      if (message[0] !== VOUCHER_MAGIC[0] || message[1] !== VOUCHER_MAGIC[1]) {
        throw new Error("invalid_voucher_magic");
      }
      const messageChannel = new PublicKey(message.slice(2, 34));
      if (!messageChannel.equals(channel.channelPda)) {
        throw new Error("wrong_channel");
      }

      const amountView = new DataView(message.buffer, message.byteOffset + 34, 8);
      const expiryView = new DataView(message.buffer, message.byteOffset + 42, 8);
      const cumulativeUnits = amountView.getBigUint64(0, true);
      const expiresAt = expiryView.getBigInt64(0, true);
      const cumulativeUsdc = Number(cumulativeUnits) / 1e6;

      if (cumulativeUnits > channel.ceiling) {
        throw new Error("channel_ceiling_exceeded");
      }
      if (expiresAt !== 0n && BigInt(Math.floor(Date.now() / 1000)) >= expiresAt) {
        throw new Error("voucher_expired");
      }
      if (cumulativeUsdc < priceUsdc) {
        throw new Error("insufficient_payment");
      }
      if (cumulativeUsdc <= highestCumulativeUsdc) {
        throw new Error("replayed_or_stale_voucher");
      }

      highestCumulativeUsdc = cumulativeUsdc;
      acceptedPayments += 1;

      sendJson(res, 200, {
        ok: true,
        paid: true,
        scheme: "channel-voucher",
        cumulativeUsdc,
        acceptedPayments,
      });
    } catch (error) {
      sendJson(res, 402, {
        error: error instanceof Error ? error.message : "invalid_payment",
        ...paymentRequirement(priceUsdc),
      });
    }
  });
}
