import test from "node:test";
import assert from "node:assert/strict";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "./paypal-webhook.js";
import { mergePayPalOrderRecords, type PayPalOrderRecord } from "../src/paypal/order-ledger.js";

type TestResponse = { code: number; payload: unknown };
function makeResponse(): { result: TestResponse; response: VercelResponse } {
  const result: TestResponse = { code: 200, payload: undefined };
  const response = {
    status(code: number) { result.code = code; return this; },
    json(payload: unknown) { result.payload = payload; return this; },
    setHeader() { return this; },
  } as unknown as VercelResponse;
  return { result, response };
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

const orderId = "ORDER-12345678";
function record(status: string): PayPalOrderRecord {
  return {
    orderId,
    status,
    amount: "5.00",
    currency: "USD",
    description: "test order",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

test("verified refund webhook records PayPal's current partial-refund status", async () => {
  const restoreEnv = setEnv({
    PAYPAL_CLIENT_ID: "test-client-id",
    PAYPAL_CLIENT_SECRET: "test-client-secret",
    PAYPAL_MODE: "sandbox",
    PAYPAL_ALLOW_LIVE: "false",
    PAYPAL_WEBHOOK_ID: "test-webhook-id",
    UPSTASH_REDIS_REST_URL: "https://redis.test",
    UPSTASH_REDIS_REST_TOKEN: "test-token",
    VERCEL: "1",
  });
  const previousFetch = globalThis.fetch;
  const kv = new Map<string, string>();
  const orderKey = `channelswarm:paypal:order:${orderId}`;
  kv.set(orderKey, JSON.stringify(record("COMPLETED")));

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://redis.test") {
      const args = JSON.parse(String(init?.body)) as Array<string | number>;
      if (args[0] === "GET") return jsonResponse({ result: kv.get(String(args[1])) || null });
      if (args[0] === "EVAL") {
        const script = String(args[1]);
        if (script.includes("local incoming = cjson.decode(ARGV[1])")) {
          const key = String(args[3]);
          const incoming = JSON.parse(String(args[4])) as PayPalOrderRecord;
          const previous = JSON.parse(kv.get(key) || "null") as PayPalOrderRecord | null;
          if (previous) kv.set(key, JSON.stringify(mergePayPalOrderRecords(previous, incoming)));
          return jsonResponse({ result: "OK" });
        }
        throw new Error(`Unexpected Redis script: ${script}`);
      }
      if (args[0] === "SET" && args[3] === "NX") return jsonResponse({ result: "OK" });
      throw new Error(`Unexpected Redis command: ${args[0]}`);
    }
    if (url.endsWith("/v1/oauth2/token")) {
      return jsonResponse({ access_token: "test-access-token", expires_in: 3600 });
    }
    if (url.endsWith("/v1/notifications/verify-webhook-signature")) {
      return jsonResponse({ verification_status: "SUCCESS" });
    }
    if (url.endsWith("/v2/payments/captures/CAPTURE-0001")) {
      return jsonResponse({ id: "CAPTURE-0001", status: "PARTIALLY_REFUNDED", amount: { currency_code: "USD", value: "5.00" } });
    }
    throw new Error(`Unexpected PayPal request: ${url}`);
  }) as typeof fetch;

  try {
    const request = {
      method: "POST",
      headers: {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://api.paypal.com/cert",
        "paypal-transmission-id": "transmission-1",
        "paypal-transmission-sig": "signature",
        "paypal-transmission-time": "2026-01-01T00:00:00Z",
      },
      body: {
        id: "WH-12345678",
        event_type: "PAYMENT.CAPTURE.REFUNDED",
        resource: {
          id: "CAPTURE-0001",
          supplementary_data: { related_ids: { order_id: orderId } },
        },
      },
    } as unknown as VercelRequest;
    const { result, response } = makeResponse();
    await handler(request, response);
    assert.equal(result.code, 200);
    assert.equal(JSON.parse(kv.get(orderKey) || "{}").status, "PARTIALLY_REFUNDED");
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv();
  }
});

test("order ledger status merge rejects stale and conflicting terminal states", () => {
  assert.equal(mergePayPalOrderRecords(record("REFUNDED"), record("COMPLETED")).status, "REFUNDED");
  assert.equal(mergePayPalOrderRecords(record("REFUNDED"), record("REVERSED")).status, "REVERSED");
  assert.equal(mergePayPalOrderRecords(record("COMPLETED"), record("DENIED")).status, "COMPLETED");
  assert.equal(mergePayPalOrderRecords(record("COMPLETED"), record("PARTIALLY_REFUNDED")).status, "PARTIALLY_REFUNDED");
});
