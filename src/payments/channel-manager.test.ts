import test from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey, type Connection } from "@solana/web3.js";
import { ChannelManager } from "./channel-manager.js";

test("ONCHAIN=true refuses to substitute simulation when mint preflight fails", async () => {
  const payer = Keypair.generate();
  const counterparty = Keypair.generate().publicKey;
  const mint = new PublicKey("2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo");
  const connection = {
    getSlot: async () => 42,
    getAccountInfo: async () => null,
  } as unknown as Connection;
  const manager = new ChannelManager({ connection, payer, usdcMint: mint, onchain: true });
  const [channelPda] = manager.deriveChannelPda(counterparty, 7n, 42);

  await assert.rejects(
    manager.openChannel({ counterparty, ceilingUsdc: 1, salt: 7n }),
    /ONCHAIN=true preflight failed; refusing to simulate channel open/,
  );
  assert.equal(manager.getChannelState(channelPda.toBase58()), undefined);
});
