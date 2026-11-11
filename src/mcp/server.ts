import "dotenv/config";
import { createInterface } from "node:readline";
import { Connection } from "@solana/web3.js";
import { getPyusdMint } from "../payments/pyusd.js";
import { findUnsupportedChannelMintExtensions } from "../payments/token-compatibility.js";
import { TOKEN_2022_PROGRAM_ID, getExtensionTypes, getMint } from "@solana/spl-token";
import { PayPalClient } from "../paypal/paypal-client.js";

type JsonRpcRequest = { jsonrpc?: string; id?: string | number; method?: string; params?: Record<string, unknown> };

function result(id: string | number | undefined, value: unknown) {
  return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] } };
}

function error(id: string | number | undefined, message: string) {
  return { jsonrpc: "2.0", id, error: { code: -32000, message } };
}

async function pyusdPreflight(rpcUrl: string) {
  const mintAddress = getPyusdMint();
  const connection = new Connection(rpcUrl, "confirmed");
  const account = await connection.getAccountInfo(mintAddress, "confirmed");
  if (!account) throw new Error(`PYUSD mint was not found at ${mintAddress.toBase58()}`);
  if (!account.owner.equals(TOKEN_2022_PROGRAM_ID)) throw new Error("PYUSD mint is not owned by Token-2022.");
  const mint = await getMint(connection, mintAddress, "confirmed", TOKEN_2022_PROGRAM_ID);
  const extensions = getExtensionTypes(mint.tlvData);
  const unsupported = findUnsupportedChannelMintExtensions(extensions);
  return {
    network: (process.env.PYUSD_NETWORK || process.env.NETWORK || "mainnet").toLowerCase(),
    mint: mintAddress.toBase58(),
    decimals: mint.decimals,
    extensions,
    unsupportedExtensions: unsupported,
    paymentChannelsCompatible: unsupported.length === 0,
  };
}

const tools = [
  {
    name: "channelswarm_pyusd_info",
    description: "Return official PYUSD mint metadata for the selected Solana network. Read-only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "channelswarm_solana_pyusd_preflight",
    description: "Validate PYUSD mint ownership, decimals, extensions, and Payment Channels compatibility. Read-only.",
    inputSchema: { type: "object", properties: { rpcUrl: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "channelswarm_paypal_create_order",
    description: "Create a PayPal order in the configured environment; customer approval is still required. Does not capture.",
    inputSchema: { type: "object", properties: { amount: { type: "number", minimum: 0.01, maximum: 100 }, description: { type: "string", maxLength: 127 } }, required: ["amount"], additionalProperties: false },
  },
  {
    name: "channelswarm_paypal_get_order",
    description: "Read a PayPal order by ID.",
    inputSchema: { type: "object", properties: { orderId: { type: "string" } }, required: ["orderId"], additionalProperties: false },
  },
  {
    name: "channelswarm_paypal_capture_order",
    description: "Capture an approved PayPal order. Requires explicit confirm='CAPTURE'.",
    inputSchema: { type: "object", properties: { orderId: { type: "string" }, confirm: { type: "string", enum: ["CAPTURE"] } }, required: ["orderId", "confirm"], additionalProperties: false },
  },
];

async function callTool(name: string, args: Record<string, unknown>) {
  if (name === "channelswarm_pyusd_info") {
    return { symbol: "PYUSD", name: "PayPal USD", decimals: 6, program: "Token-2022", network: (process.env.PYUSD_NETWORK || process.env.NETWORK || "mainnet").toLowerCase(), mint: getPyusdMint().toBase58() };
  }
  if (name === "channelswarm_solana_pyusd_preflight") {
    const rpcUrl = typeof args.rpcUrl === "string" && args.rpcUrl ? args.rpcUrl : process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
    return pyusdPreflight(rpcUrl);
  }
  const paypal = new PayPalClient();
  if (name === "channelswarm_paypal_create_order") {
    const amount = Number(args.amount);
    if (!Number.isFinite(amount) || amount < 0.01 || amount > 100 || Math.round(amount * 100) !== amount * 100) throw new Error("amount must be 0.01..100.00 USD with at most two decimals.");
    const description = typeof args.description === "string" && args.description.trim() ? args.description.trim().slice(0, 127) : "ChannelSwarm agent settlement";
    const order = await paypal.createOrder(amount, description);
    return { id: order.id, status: order.status, approveUrl: order.approveUrl, mode: process.env.PAYPAL_MODE || "sandbox" };
  }
  if (name === "channelswarm_paypal_get_order") return paypal.getOrder(String(args.orderId || ""));
  if (name === "channelswarm_paypal_capture_order") {
    if (args.confirm !== "CAPTURE") throw new Error("confirm='CAPTURE' is required.");
    return paypal.captureOrder(String(args.orderId || ""));
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function handle(request: JsonRpcRequest) {
  if (request.method === "initialize") {
    return { jsonrpc: "2.0", id: request.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "channelswarm", version: "0.4.2" } } };
  }
  if (request.method === "notifications/initialized") return undefined;
  if (request.method === "tools/list") return { jsonrpc: "2.0", id: request.id, result: { tools } };
  if (request.method === "tools/call") {
    const params = request.params || {};
    try { return result(request.id, await callTool(String(params.name || ""), (params.arguments || {}) as Record<string, unknown>)); }
    catch (err) { return error(request.id, err instanceof Error ? err.message : "Tool call failed."); }
  }
  return error(request.id, `Unsupported method: ${request.method || "unknown"}`);
}

const readline = createInterface({ input: process.stdin, crlfDelay: Infinity });
readline.on("line", async (line) => {
  if (!line.trim()) return;
  try {
    const response = await handle(JSON.parse(line) as JsonRpcRequest);
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  } catch (err) {
    process.stdout.write(`${JSON.stringify(error(undefined, err instanceof Error ? err.message : "Invalid JSON-RPC request."))}\n`);
  }
});
