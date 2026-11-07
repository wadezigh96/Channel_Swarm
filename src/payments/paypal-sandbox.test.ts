import { test } from "node:test";
import assert from "node:assert/strict";
import { createPayPalSandboxOrder, capturePayPalSandboxOrder } from "./paypal-sandbox.js";

function mockFetch(queue: unknown[]) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    const next = queue.shift();
    if (next instanceof Response) return next;
    return new Response(JSON.stringify(next), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetchImpl, calls };
}

test("PayPal order creation uses sandbox OAuth and idempotency", async () => {
  process.env.PAYPAL_CLIENT_ID = "sandbox-client";
  process.env.PAYPAL_CLIENT_SECRET = "sandbox-secret";
  process.env.APP_BASE_URL = "https://channelswarm.example";
  const mock = mockFetch([
    { access_token: "mock-access-token" },
    { id: "ORDER-12345", status: "CREATED", links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-12345" }] },
  ]);
  const result = await createPayPalSandboxOrder({
    amount: "4.00", currency: "USD", description: "Agent service fee", requestId: "create-req-1234",
  }, { fetchImpl: mock.fetchImpl });
  assert.equal(result.environment, "sandbox");
  assert.equal(result.id, "ORDER-12345");
  const orderBody = JSON.parse(String(mock.calls[1].init?.body));
  assert.equal(orderBody.purchase_units[0].custom_id, "create-req-1234");
  assert.equal(orderBody.application_context.return_url, "https://channelswarm.example/checkout.html?paypal=return");
  assert.match(result.approvalUrl ?? "", /sandbox.paypal.com/);
  assert.equal(mock.calls[0].url, "https://api-m.sandbox.paypal.com/v1/oauth2/token");
  assert.equal(mock.calls[1].url, "https://api-m.sandbox.paypal.com/v2/checkout/orders");
  assert.equal(new Headers(mock.calls[1].init?.headers).get("PayPal-Request-Id"), "create-req-1234");
});

test("PayPal capture refuses unless explicit user approval is true", async () => {
  await assert.rejects(capturePayPalSandboxOrder({
    orderId: "ORDER-12345", expectedAmount: "4.00", currency: "USD",
    approvedByUser: false, requestId: "capture-req-1234",
  }), (error: unknown) => error instanceof Error && error.name === "ZodError");
});

test("PayPal capture checks order status and exact amount before capture", async () => {
  process.env.PAYPAL_CLIENT_ID = "sandbox-client";
  process.env.PAYPAL_CLIENT_SECRET = "sandbox-secret";
  const mock = mockFetch([
    { access_token: "mock-access-token" },
    { id: "ORDER-12345", status: "APPROVED", purchase_units: [{ custom_id: "capture-req-1234", amount: { currency_code: "USD", value: "5.00" } }] },
  ]);
  await assert.rejects(capturePayPalSandboxOrder({
    orderId: "ORDER-12345", expectedAmount: "4.00", currency: "USD",
    approvedByUser: true, requestId: "capture-req-1234",
  }, { fetchImpl: mock.fetchImpl }), /amount\/currency/);
  assert.equal(mock.calls.length, 2);
});

test("PayPal capture proceeds only for approved exact-value sandbox order", async () => {
  process.env.PAYPAL_CLIENT_ID = "sandbox-client";
  process.env.PAYPAL_CLIENT_SECRET = "sandbox-secret";
  const mock = mockFetch([
    { access_token: "mock-access-token" },
    { id: "ORDER-12345", status: "APPROVED", purchase_units: [{ custom_id: "capture-req-1234", amount: { currency_code: "USD", value: "4.00" } }] },
    { access_token: "mock-access-token-2" },
    { id: "ORDER-12345", status: "COMPLETED" },
  ]);
  const result = await capturePayPalSandboxOrder({
    orderId: "ORDER-12345", expectedAmount: "4.00", currency: "USD",
    approvedByUser: true, requestId: "capture-req-1234",
  }, { fetchImpl: mock.fetchImpl });
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.humanApproved, true);
  assert.equal(mock.calls[3].url, "https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER-12345/capture");
});


test("PayPal webhook signature is checked with PayPal Sandbox API", async () => {
  const { verifyPayPalWebhookSignature } = await import("./paypal-sandbox.js");
  process.env.PAYPAL_CLIENT_ID = "sandbox-client";
  process.env.PAYPAL_CLIENT_SECRET = "sandbox-secret";
  process.env.PAYPAL_WEBHOOK_ID = "WH-TEST-123";
  const calls: string[] = [];
  const ok = await verifyPayPalWebhookSignature({
    authAlgo: "SHA256withRSA",
    certUrl: "https://api-m.sandbox.paypal.com/certs/test",
    transmissionId: "transmission-123",
    transmissionSignature: "signature",
    transmissionTime: "2026-11-07T00:00:00Z",
  }, { id: "WH-EVENT-123", event_type: "PAYMENT.CAPTURE.COMPLETED" }, {
    fetchImpl: async (url, init) => {
      calls.push(String(url));
      if (calls.length === 1) return new Response(JSON.stringify({ access_token: "mock-access-token" }), { status: 200 });
      const body = JSON.parse(String(init?.body));
      assert.equal(body.webhook_id, "WH-TEST-123");
      assert.equal(body.webhook_event.id, "WH-EVENT-123");
      return new Response(JSON.stringify({ verification_status: "SUCCESS" }), { status: 200 });
    },
  });
  assert.equal(ok, true);
  assert.equal(calls[1], "https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature");
});
