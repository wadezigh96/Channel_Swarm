import assert from "node:assert/strict";
import { test } from "node:test";
import { PayPalClient } from "./paypal-client.js";

test("PayPal rejects invalid amounts before making network calls", async () => {
  const oldId = process.env.PAYPAL_CLIENT_ID;
  const oldSecret = process.env.PAYPAL_CLIENT_SECRET;
  process.env.PAYPAL_CLIENT_ID = "test-client";
  process.env.PAYPAL_CLIENT_SECRET = "test-secret";
  try {
    const client = new PayPalClient();
    await assert.rejects(() => client.createOrder(0), /paypal_amount_must_be_positive/);
    await assert.rejects(() => client.createOrder(Number.NaN), /paypal_amount_must_be_positive/);
  } finally {
    if (oldId === undefined) delete process.env.PAYPAL_CLIENT_ID; else process.env.PAYPAL_CLIENT_ID = oldId;
    if (oldSecret === undefined) delete process.env.PAYPAL_CLIENT_SECRET; else process.env.PAYPAL_CLIENT_SECRET = oldSecret;
  }
});

test("PayPal live mode is locked unless separately enabled", () => {
  const oldMode = process.env.PAYPAL_MODE;
  const oldEnabled = process.env.PAYPAL_LIVE_ENABLED;
  process.env.PAYPAL_MODE = "live";
  delete process.env.PAYPAL_LIVE_ENABLED;
  try {
    assert.throws(() => new PayPalClient(), /PayPal live mode is locked/);
  } finally {
    if (oldMode === undefined) delete process.env.PAYPAL_MODE; else process.env.PAYPAL_MODE = oldMode;
    if (oldEnabled === undefined) delete process.env.PAYPAL_LIVE_ENABLED; else process.env.PAYPAL_LIVE_ENABLED = oldEnabled;
  }
});

test("PayPal order creation returns approval link and does not capture", async () => {
  const oldFetch = globalThis.fetch;
  const oldId = process.env.PAYPAL_CLIENT_ID;
  const oldSecret = process.env.PAYPAL_CLIENT_SECRET;
  process.env.PAYPAL_CLIENT_ID = "test-client";
  process.env.PAYPAL_CLIENT_SECRET = "test-secret";
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/v1/oauth2/token")) return new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }), { status: 200 });
    if (url.endsWith("/v2/checkout/orders")) {
      const body = JSON.parse(String(init?.body)) as { purchase_units: Array<{ amount: { value: string } }> };
      assert.equal(body.purchase_units[0].amount.value, "1.24");
      return new Response(JSON.stringify({ id: "ORDER-1", status: "CREATED", links: [{ href: "https://paypal.test/approve", rel: "approve", method: "GET" }] }), { status: 201 });
    }
    throw new Error("Unexpected PayPal request: " + url);
  }) as typeof fetch;
  try {
    const client = new PayPalClient();
    const order = await client.createOrder(1.235, "test", "stable-test-request-id");
    assert.equal(order.id, "ORDER-1");
    assert.equal(order.approveUrl, "https://paypal.test/approve");
    assert.equal(order.status, "CREATED");
    assert.equal(calls.length, 2);
    assert.equal(calls.some((url) => url.includes("/capture")), false);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldId === undefined) delete process.env.PAYPAL_CLIENT_ID; else process.env.PAYPAL_CLIENT_ID = oldId;
    if (oldSecret === undefined) delete process.env.PAYPAL_CLIENT_SECRET; else process.env.PAYPAL_CLIENT_SECRET = oldSecret;
  }
});

test("webhook verification requires configured webhook ID", async () => {
  const old = process.env.PAYPAL_WEBHOOK_ID;
  delete process.env.PAYPAL_WEBHOOK_ID;
  try {
    const client = new PayPalClient();
    await assert.rejects(() => client.verifyWebhook({
      transmissionId: "id", transmissionTime: "time", certUrl: "https://paypal.test/cert",
      authAlgo: "SHA256withRSA", transmissionSig: "sig",
    }, {}), /paypal_webhook_id_missing/);
  } finally {
    if (old === undefined) delete process.env.PAYPAL_WEBHOOK_ID; else process.env.PAYPAL_WEBHOOK_ID = old;
  }
});
