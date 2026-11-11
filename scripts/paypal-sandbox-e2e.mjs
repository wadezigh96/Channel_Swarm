#!/usr/bin/env node

import "dotenv/config";
import { spawn } from "node:child_process";
import process from "node:process";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const args = new Set(process.argv.slice(2));
const amountArg = process.argv.find((value) => value.startsWith("--amount="));
const descriptionArg = process.argv.find((value) => value.startsWith("--description="));
const timeoutArg = process.argv.find((value) => value.startsWith("--timeout-seconds="));
const pollArg = process.argv.find((value) => value.startsWith("--poll-seconds="));
const amount = Number(amountArg?.split("=")[1] ?? "5.00");
const description = descriptionArg?.slice("--description=".length) || "ChannelSwarm automated Sandbox E2E";
const timeoutSeconds = Number(timeoutArg?.split("=")[1] ?? "300");
const pollSeconds = Number(pollArg?.split("=")[1] ?? "5");
const capture = args.has("--capture");
const dryRun = args.has("--dry-run");
const help = args.has("--help") || args.has("-h");

function usage() {
  console.log(`Usage:
  node scripts/paypal-sandbox-e2e.mjs [options]

Options:
  --amount=5.00                 Sandbox order amount in USD (0.01..100.00).
  --description=TEXT            Order description.
  --capture                     Wait for approval, capture, and verify COMPLETED.
  --timeout-seconds=300         Maximum approval wait time.
  --poll-seconds=5              Delay between get-order calls.
  --dry-run                     Validate configuration and print the test plan only.
  --help                        Show this help.

Examples:
  npm run e2e:paypal:sandbox -- --dry-run
  npm run e2e:paypal:sandbox -- --amount=5.00
  npm run e2e:paypal:sandbox -- --amount=5.00 --capture
`);
}

if (help) {
  usage();
  process.exit(0);
}

function fail(message) {
  console.error(`[E2E] FAIL: ${message}`);
  process.exitCode = 1;
}

function validateConfig() {
  const mode = (process.env.PAYPAL_MODE || "sandbox").trim().toLowerCase();
  if (mode !== "sandbox") throw new Error("This runner only permits PAYPAL_MODE=sandbox.");
  if (!Number.isFinite(amount) || amount < 0.01 || amount > 100 || Math.round(amount * 100) !== amount * 100) {
    throw new Error("--amount must be between 0.01 and 100.00 USD with at most two decimals.");
  }
  if (!description.trim() || description.length > 127) throw new Error("--description must be 1..127 characters.");
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 5) throw new Error("--timeout-seconds must be an integer >= 5.");
  if (!Number.isInteger(pollSeconds) || pollSeconds < 1) throw new Error("--poll-seconds must be an integer >= 1.");
  if (!dryRun && (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET)) {
    throw new Error("Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET for PayPal Sandbox, or use --dry-run.");
  }
  return mode;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startMcp() {
  const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/mcp/server.ts"], {
    cwd: root,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let buffer = "";
  let stderr = "";
  const pending = new Map();
  let nextId = 1;

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    for (;;) {
      const newline = buffer.indexOf("\n");
      if (newline < 0) break;
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      try {
        const response = JSON.parse(line);
        const waiter = pending.get(response.id);
        if (waiter) {
          pending.delete(response.id);
          if (response.error) waiter.reject(new Error(response.error.message || "MCP tool failed"));
          else waiter.resolve(response.result);
        }
      } catch {
        // npm/tsx startup text is ignored; MCP JSON responses are still parsed by line.
      }
    }
  });
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  function request(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  function stop() {
    for (const waiter of pending.values()) waiter.reject(new Error("MCP process stopped"));
    pending.clear();
    if (!child.killed) child.kill("SIGTERM");
  }

  return { child, request, stop, getStderr: () => stderr };
}

function toolText(result) {
  return JSON.parse(result.content?.[0]?.text || "{}");
}

async function run() {
  const mode = validateConfig();
  console.log(`[E2E] PayPal mode: ${mode}`);
  console.log(`[E2E] Amount: ${amount.toFixed(2)} USD`);
  console.log(`[E2E] Capture requested: ${capture ? "yes" : "no"}`);

  if (dryRun) {
    console.log("[E2E] Dry run valid. No MCP process, order, approval, or capture was started.");
    return;
  }

  const mcp = startMcp();
  try {
    await mcp.request("initialize", {});
    const tools = await mcp.request("tools/list", {});
    const names = new Set((tools.tools || []).map((tool) => tool.name));
    for (const required of ["channelswarm_paypal_create_order", "channelswarm_paypal_get_order", "channelswarm_paypal_capture_order"]) {
      if (!names.has(required)) throw new Error(`MCP tool missing: ${required}`);
    }

    const created = toolText(await mcp.request("tools/call", {
      name: "channelswarm_paypal_create_order",
      arguments: { amount, description },
    }));
    if (!created.id || created.status !== "CREATED" || !created.approveUrl) {
      throw new Error(`Unexpected create response: ${JSON.stringify(created)}`);
    }
    console.log(`[E2E] Created order ${created.id} with status ${created.status}`);
    console.log(`[E2E] Approve in a PayPal Sandbox buyer account: ${created.approveUrl}`);

    if (!capture) {
      console.log("[E2E] Create-only run complete. No capture was requested.");
      return;
    }

    const deadline = Date.now() + timeoutSeconds * 1000;
    let order;
    do {
      await sleep(pollSeconds * 1000);
      order = toolText(await mcp.request("tools/call", {
        name: "channelswarm_paypal_get_order",
        arguments: { orderId: created.id },
      }));
      console.log(`[E2E] Order ${created.id} status: ${order.status}`);
      if (["VOIDED", "CANCELLED"].includes(order.status)) throw new Error(`Order cannot be captured in status ${order.status}.`);
      if (order.status === "APPROVED") break;
    } while (Date.now() < deadline);

    if (order?.status !== "APPROVED") throw new Error(`Approval timeout after ${timeoutSeconds}s; final status was ${order?.status || "unknown"}.`);

    const captured = toolText(await mcp.request("tools/call", {
      name: "channelswarm_paypal_capture_order",
      arguments: { orderId: created.id, confirm: "CAPTURE" },
    }));
    if (captured.status !== "COMPLETED") throw new Error(`Unexpected capture response: ${JSON.stringify(captured)}`);
    const captureId = captured.purchase_units?.[0]?.payments?.captures?.[0]?.id || "unknown";
    console.log(`[E2E] Capture completed: ${captureId}`);

    const finalOrder = toolText(await mcp.request("tools/call", {
      name: "channelswarm_paypal_get_order",
      arguments: { orderId: created.id },
    }));
    if (finalOrder.status !== "COMPLETED") throw new Error(`Final order status was ${finalOrder.status}, expected COMPLETED.`);
    console.log("[E2E] PASS: create -> approve -> capture -> verify COMPLETED");
  } finally {
    mcp.stop();
  }
}

try {
  await run();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
