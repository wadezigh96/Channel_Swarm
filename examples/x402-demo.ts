import { Keypair, PublicKey } from "@solana/web3.js";
import { createX402DemoServer } from "../src/payments/x402-server.js";
import { ChannelManager } from "../src/payments/channel-manager.js";

async function main() {
  const PORT = Number(process.env.PORT ?? 4020);
  const PRICE_USDC = Number(process.env.PRICE_USDC ?? 0.002);

  const payer = Keypair.generate();
  const payee = Keypair.generate();
  const connection = { getSlot: async () => 1 } as any;

  const manager = new ChannelManager({
    connection,
    payer,
    usdcMint: new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
  });

  const channelId = await manager.openChannel({
    counterparty: payee.publicKey,
    ceilingUsdc: 1,
    salt: 402n,
  });

  const voucher = await manager.createVoucher(channelId, PRICE_USDC);
  console.log("Issued x402-style voucher:", {
    channelId,
    cumulativeUsdc: Number(voucher.cumulativeAmount) / 1e6,
  });

  const server = createX402DemoServer(manager, channelId, payer, PRICE_USDC);
  server.listen(PORT, () => {
    console.log(`x402 demo listening on http://localhost:${PORT}/resource`);
    console.log("Send the voucher as base64 in the x-payment header.");
    console.log("This is a local x402-style demo, not a claim of full production x402 compatibility.");
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
