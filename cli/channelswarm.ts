#!/usr/bin/env node
import "dotenv/config";
import { Connection, PublicKey } from "@solana/web3.js";
import { ChannelManager } from "../src/payments/channel-manager.js";
import { getPyusdMint, PYUSD_INFO } from "../src/payments/pyusd.js";
import { PayPalClient } from "../src/paypal/paypal-client.js";
import { loadPayerFromEnv } from "../src/wallet.js";
import { findUnsupportedChannelMintExtensions } from "../src/payments/token-compatibility.js";
import { TOKEN_2022_PROGRAM_ID, getExtensionTypes, getMint } from "@solana/spl-token";

const usage = `ChannelSwarm CLI

Safe/read-only:
  npm run cli -- pyusd info
  npm run cli -- pyusd preflight [--rpc URL]
  npm run cli -- paypal get --order-id ORDER_ID

PayPal sandbox:
  npm run cli -- paypal create --amount 5 --description "Agent settlement"
  npm run cli -- paypal capture --order-id ORDER_ID --confirm CAPTURE

Solana PYUSD channel (simulation by default):
  npm run cli -- pyusd open --payee WALLET --amount 1
  npm run cli -- pyusd open --payee WALLET --amount 1 --onchain --confirm ONCHAIN

MCP stdio server:
  npm run mcp

Environment is loaded from .env. Live PayPal remains blocked unless PAYPAL_ALLOW_LIVE=true.
`;

type Args = Record<string, string | boolean>;

function parseArgs(values: string[]): Args {
  const result: Args = {};
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = values[i + 1];
    if (next && !next.startsWith("--")) {
      result[key] = next;
      i += 1;
    } else {
      result[key] = true;
    }
  }
  return result;
}

function stringArg(args: Args, name: string, required = true): string {
  const value = args[name];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!required) return "";
  throw new Error(`Missing --${name}.\n\n${usage}`);
}

function json(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

async function pyusdPreflight(rpcUrl: string) {
  const mintAddress = getPyusdMint();
  const connection = new Connection(rpcUrl, "confirmed");
  const account = await connection.getAccountInfo(mintAddress, "confirmed");
  if (!account) throw new Error(`PYUSD mint was not found at ${mintAddress.toBase58()}`);
  if (!account.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    throw new Error(`PYUSD mint is not owned by Token-2022: ${account.owner.toBase58()}`);
  }
  const mint = await getMint(connection, mintAddress, "confirmed", TOKEN_2022_PROGRAM_ID);
  const extensions = getExtensionTypes(mint.tlvData);
  const unsupported = findUnsupportedChannelMintExtensions(extensions);
  return {
    network: (process.env.PYUSD_NETWORK || process.env.NETWORK || "mainnet").toLowerCase(),
    rpcUrl,
    mint: mintAddress.toBase58(),
    owner: account.owner.toBase58(),
    decimals: mint.decimals,
    extensions,
    unsupportedExtensions: unsupported,
    paymentChannelsCompatible: unsupported.length === 0,
  };
}

async function main(): Promise<void> {
  const [group, action, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (!group || group === "help" || group === "--help") {
    console.log(usage);
    return;
  }

  if (group === "pyusd" && action === "info") {
    json({ ...PYUSD_INFO, network: (process.env.PYUSD_NETWORK || process.env.NETWORK || "mainnet").toLowerCase() });
    return;
  }

  if (group === "pyusd" && action === "preflight") {
    const rpc = typeof args.rpc === "string" ? args.rpc : process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
    json(await pyusdPreflight(rpc));
    return;
  }

  if (group === "pyusd" && action === "open") {
    const payee = new PublicKey(stringArg(args, "payee"));
    const amount = Number(stringArg(args, "amount"));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("--amount must be a positive number.");
    const onchain = args.onchain === true;
    if (onchain && args.confirm !== "ONCHAIN") {
      throw new Error("Real Solana execution requires --confirm ONCHAIN in addition to --onchain.");
    }
    if (onchain) process.env.ONCHAIN = "true";
    const payer = loadPayerFromEnv();
    if (!payer) throw new Error("SOLANA_PRIVATE_KEY is required for channel operations.");
    const rpc = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
    const manager = new ChannelManager({
      connection: new Connection(rpc, "confirmed"),
      payer,
      usdcMint: getPyusdMint(),
      onchain,
    });
    const channelId = await manager.openChannel({ counterparty: payee, ceilingUsdc: amount });
    json({ channelId, mode: onchain ? "onchain" : "sim", mint: getPyusdMint().toBase58(), payee: payee.toBase58() });
    return;
  }

  if (group === "paypal" && action === "create") {
    const amount = Number(stringArg(args, "amount"));
    if (!Number.isFinite(amount) || amount < 0.01 || amount > 100 || Math.round(amount * 100) !== amount * 100) {
      throw new Error("--amount must be between 0.01 and 100.00 USD with at most two decimals.");
    }
    const description = stringArg(args, "description", false) || "ChannelSwarm agent settlement";
    const order = await new PayPalClient().createOrder(amount, description);
    json({ id: order.id, status: order.status, approveUrl: order.approveUrl, mode: process.env.PAYPAL_MODE || "sandbox" });
    return;
  }

  if (group === "paypal" && action === "get") {
    const order = await new PayPalClient().getOrder(stringArg(args, "order-id"));
    json(order);
    return;
  }

  if (group === "paypal" && action === "capture") {
    if (args.confirm !== "CAPTURE") throw new Error("Capturing a PayPal order requires --confirm CAPTURE.");
    const order = await new PayPalClient().captureOrder(stringArg(args, "order-id"));
    json(order);
    return;
  }

  throw new Error(`Unknown command.\n\n${usage}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
