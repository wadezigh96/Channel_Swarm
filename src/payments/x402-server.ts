import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import type { ChannelManager } from "./channel-manager.js";

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

export function createX402DemoServer(manager: ChannelManager, channelId: string, payer: Keypair, priceUsdc: number) {\n  let highestCumulativeUsdc = 0;\n  let acceptedPayments = 0;
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
      const voucher = await manager.getVoucher(channelId);
      if (!voucher || Buffer.compare(Buffer.from(voucher.message), Buffer.from(verified.message)) !== 0) {
        throw new Error("voucher_not_issued_by_server");
      }
      const cumulativeUsdc = Number(voucher.cumulativeAmount) / 1e6;
      if (cumulativeUsdc < priceUsdc) {
        throw new Error("insufficient_payment");
      }

      if (cumulativeUsdc <= highestCumulativeUsdc) {\n        throw new Error("replayed_or_stale_voucher");\n      }\n      highestCumulativeUsdc = cumulativeUsdc;\n      acceptedPayments += 1;\n\n      sendJson(res, 200, {
        ok: true,
        paid: true,
        scheme: "channel-voucher",
        cumulativeUsdc,
      });
    } catch (error) {
      sendJson(res, 402, {
        error: error instanceof Error ? error.message : "invalid_payment",
        ...paymentRequirement(priceUsdc),
      });
    }
  });
}


