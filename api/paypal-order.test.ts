import test from "node:test";
import assert from "node:assert/strict";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "./paypal-order.js";
import { mergePayPalOrderRecords, type PayPalOrderRecord } from "../src/paypal/order-ledger.js";

type TestResponse = { code: number; payload: unknown; headers: Record<string, string> };
function makeResponse(): { result: TestResponse; response: VercelResponse } {
  const result: TestResponse = { code: 200, payload: undefined, headers: {} };
  const response = {
    status(code: number) { result.code = code; return this; },
    json(payload: unknown) { result.payload = payload; return this; },
    setHeader(name: string, value: string) { result.headers[name] = value; return this; },
  } as unknown as VercelResponse;
  return { result, response };
}

function makeRequest(method: string, body: unknown = {}, query: Record<string, unknown> = {}): VercelRequest {
  return {
    method,
    body,
    query,
    headers: { "x-forwarded-for": "203.0.113.9" },
  } as unknown as VercelRequest;
}

function setEnv(values: Record<string, string | undefined>): () => void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const TEST_ORDER_ID = "ORDER-12345678";

test("PayPal order API rejects zero instead of silently defaulting to a chargeable order", async () => {
  const restoreEnv = setEnv({
    PAYPAL_CLIENT_ID: "test-client-id",
    PAYPAL_CLIENT_SECRET: "test-client-secret",
    PAYPAL_MODE: "sandbox",
    PAYPAL_ALLOW_LIVE: "false",
    UPSTASH_REDIS_REST_URL: "https://redis.test",
    UPSTASH_REDIS_REST_TOKEN: "test-token",
    VERCEL: "1",
  });
  const previousFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => { called = true; return jsonResponse({}); }) as typeof fetch;
  try {
    const { result, response } = makeResponse();
    await handler(makeRequest("POST", { amount: 0 }), response);
    assert.equal(result.code, 400);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv();
  }
});

test("PayPal order creation stores the order and capture requires an approved matching amount", async () => {
  const restoreEnv = setEnv({
    PAYPAL_CLIENT_ID: "test-client-id",
    PAYPAL_CLIENT_SECRET: "test-client-secret",
    PAYPAL_MODE: "sandbox",
    PAYPAL_ALLOW_LIVE: "false",
    UPSTASH_REDIS_REST_URL: "https://redis.test",
    UPSTASH_REDIS_REST_TOKEN: "test-token",
    VERCEL: "1",
  });
  const previousFetch = globalThis.fetch;
  const kv = new Map<string, string>();
  const paypalCalls: string[] = [];
  let captureRequestId = "";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://redis.test") {
      const args = JSON.parse(String(init?.body)) as Array<string | number>;
      if (args[0] === "EVAL") {
        const script = String(args[1]);
        if (script.includes("local incoming = cjson.decode(ARGV[1])")) {
          const key = String(args[3]);
          const incoming = JSON.parse(String(args[4])) as PayPalOrderRecord;
          const existing = JSON.parse(kv.get(key) || "null") as PayPalOrderRecord | null;
          kv.set(key, JSON.stringify(existing ? mergePayPalOrderRecords(existing, incoming) : incoming));
          return jsonResponse({ result: "OK" });
        }
        return jsonResponse({ result: 1 });
      }
      if (args[0] === "SET") {
        kv.set(String(args[1]), String(args[2]));
        return jsonResponse({ result: "OK" });
      }
      if (args[0] === "GET") return jsonResponse({ result: kv.get(String(args[1])) || null });
      throw new Error(`Unexpected Redis command: ${args[0]}`);
    }
    paypalCalls.push(url);
    if (url.endsWith("/v1/oauth2/token")) return jsonResponse({ access_token: "test-access-token", expires_in: 3600 });
    if (url.endsWith("/v2/checkout/orders")) {
      return jsonResponse({
        id: TEST_ORDER_ID,
        status: "CREATED",
        links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=abc", method: "GET" }],
        purchase_units: [{ amount: { currency_code: "USD", value: "5.00" } }],
      });
    }
    if (url.endsWith(`/v2/checkout/orders/${TEST_ORDER_ID}`)) {
      return jsonResponse({
        id: TEST_ORDER_ID,
        status: "APPROVED",
        links: [],
        purchase_units: [{ amount: { currency_code: "USD", value: "5.00" } }],
      });
    }
    if (url.endsWith(`/v2/checkout/orders/${TEST_ORDER_ID}/capture`)) {
      captureRequestId = ((init?.headers || {}) as Record<string, string>)["PayPal-Request-Id"] || "";
      return jsonResponse({
        id: TEST_ORDER_ID,
        status: "COMPLETED",
        links: [],
        purchase_units: [{ amount: { currency_code: "USD", value: "5.00" }, payments: { captures: [{ id: "CAPTURE-0001", status: "COMPLETED" }] } }],
      });
    }
    throw new Error(`Unexpected PayPal request: ${url}`);
  }) as typeof fetch;

  try {
    const created = makeResponse();
    await handler(makeRequest("POST", { amount: 5, description: "test payment" }), created.response);
    assert.equal(created.result.code, 200);
    const createdBody = created.result.payload as { order: { orderId: string; status: string }; approveUrl: string };
    assert.equal(createdBody.order.orderId, TEST_ORDER_ID);
    assert.equal(createdBody.order.status, "CREATED");
    assert.match(createdBody.approveUrl, /^https:\/\//);

    const storedKey = `channelswarm:paypal:order:${TEST_ORDER_ID}`;
    assert.equal(JSON.parse(kv.get(storedKey) || "{}").amount, "5.00");

    const captured = makeResponse();
    await handler(makeRequest("POST", { action: "capture", orderId: TEST_ORDER_ID }), captured.response);
    assert.equal(captured.result.code, 200);
    const capturedBody = captured.result.payload as { order: { status: string; captureId: string } };
    assert.equal(capturedBody.order.status, "COMPLETED");
    assert.equal(capturedBody.order.captureId, "CAPTURE-0001");
    assert.equal(captureRequestId.length, 38);
    assert.equal(paypalCalls.filter((url) => url.endsWith(`/v2/checkout/orders/${TEST_ORDER_ID}/capture`)).length, 1);
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv();
  }
});
