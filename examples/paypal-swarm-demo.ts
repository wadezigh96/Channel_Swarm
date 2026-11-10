/**
 * Demo: Agent swarm settles via PayPal sandbox
 *
 * Usage:
 *   PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... npx tsx examples/paypal-swarm-demo.ts
 */

import { PayPalClient } from "../src/paypal/paypal-client.js";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("═".repeat(55));
  console.log("  ChannelSwarm × PayPal Sandbox Demo");
  console.log("═".repeat(55));

  const paypal = new PayPalClient();

  if (!paypal.isConfigured()) {
    console.error("Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET");
    process.exit(1);
  }

  console.log("\n[1] Creating PayPal order for agent settlement...");
  const amount = 5.0;
  const order = await paypal.createOrder(amount, "StockHunter → Alpha agent settlement");

  console.log(`\nOrder ID: ${order.id}`);
  console.log(`Status:   ${order.status}`);
  if (order.approveUrl) {
    console.log(`\nApprove this order in sandbox (open in browser):`);
    console.log(order.approveUrl);
    console.log("\n(Use a PayPal sandbox personal account to approve)");
  }

  console.log("\n[2] After approval, capture with:");
  console.log(`   await paypal.captureOrder("${order.id}")`);

  console.log("\n═".repeat(55));
  console.log("  Demo complete. Dual-rail ready: Solana channels + PayPal.");
  console.log("═".repeat(55));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
