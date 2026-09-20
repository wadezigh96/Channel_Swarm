import { createServer } from "node:http";
import { Keypair, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import { ChannelManager } from "../src/payments/channel-manager.js";

const PORT = Number(process.env.X402_PORT ?? 4020);
const PRICE_USDC = Number(process.env.X402_PRICE_USDC ?? 0.002);

const payer = Keypair.generate();
const payee = Keypair.generate();
const connection = { getSlot: async () => 1 } as any;
const manager = new ChannelManager({
  connection,
  payer,
  usdcMint: new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
});

const channelIdPromise = manager.openChannel({
  counterparty: payee.publicKey,
  ceilingUsdc: 1,
  salt: 402n,
});

function json(res: any, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function decodeVoucher(value: string) {
  const raw = Buffer.from(value, "base64");
  if (raw.length !== 114) throw new Error("voucher must contain 50-byte message + 64-byte signature");
  return { message: raw.subarray(0, 50), signature: raw.subarray(50) };
}

const server = createServer(async (req, res) => {
  if (req.url !== "/resource" || req.method !== "GET") {
    json(res, 404, { error: "not_found" });
    return;
  }

  const auth = req.headers["x-payment"];
  if (typeof auth !== "string") {
    res.writeHead(402, {
      "content-type": "application/json",
      "x-payment-required": JSON.stringify({
        scheme: "channel-voucher",
        network: "solana",
        priceUsdc: PRICE_USDC,
        paymentHeader: "x-payment",
      }),
    });
    res.end(JSON.stringify({
      error: "payment_required",
      scheme: "channel-voucher",
      priceUsdc: PRICE_USDC,
    }));
    return;
  }

  try {
    const { message, signature } = decodeVoucher(auth);
    if (!nacl.sign.detached.verify(message, signature, payer.publicKey.toBytes())) {
      throw new Error("invalid_signature");
    }
    const channelId = await channelIdPromise;
    const voucher = await manager.getVoucher(channelId);
    if (!voucher || Buffer.compare(Buffer.from(voucher.message), message) !== 0) {
      throw new Error("voucher_not_issued_by_server");
    }
    json(res, 200, {
      ok: true,
      paid: true,
      scheme: "channel-voucher",
      cumulativeUsdc: Number(voucher.cumulativeAmount) / 1e6,
    });
  } catch (error) {
    json(res, 402, { error: error instanceof Error ? error.message : "invalid_payment" });
  }
});

server.listen(PORT, () => {
  console.log(`[x402] demo resource listening on http://localhost:${PORT}/resource`);
  console.log(`[x402] payment: GET /resource with x-payment: base64(message+signature)`);
});
