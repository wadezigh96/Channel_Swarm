import { z } from "zod";
import { getAppBaseUrl } from "../security/origin.js";

const CreateOrderInput = z.object({
  amount: z.string().regex(/^(?:0|[1-9]\d{0,5})\.\d{2}$/),
  currency: z.literal("USD"),
  description: z.string().trim().min(3).max(120),
  requestId: z.string().regex(/^[A-Za-z0-9-]{8,38}$/),
}).strict();

const CaptureOrderInput = z.object({
  orderId: z.string().regex(/^[A-Z0-9-]{5,50}$/),
  expectedAmount: z.string().regex(/^(?:0|[1-9]\d{0,5})\.\d{2}$/),
  currency: z.literal("USD"),
  approvedByUser: z.literal(true),
  requestId: z.string().regex(/^[A-Za-z0-9-]{8,38}$/),
}).strict();

export class PayPalConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayPalConfigurationError";
  }
}

type Fetcher = typeof fetch;

async function paypalRequest(
  path: string,
  init: RequestInit,
  fetchImpl: Fetcher,
): Promise<any> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new PayPalConfigurationError("PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET are not configured");
  }

  const base = "https://api-m.sandbox.paypal.com";
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenResponse = await fetchImpl(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(15_000),
  });
  if (!tokenResponse.ok) throw new Error(`PayPal OAuth failed (HTTP ${tokenResponse.status})`);
  const tokenPayload = z.object({ access_token: z.string().min(1) }).passthrough().parse(await tokenResponse.json());

  const response = await fetchImpl(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`PayPal API request failed (HTTP ${response.status})`);
  return payload;
}

export async function createPayPalSandboxOrder(
  rawInput: unknown,
  options: { fetchImpl?: Fetcher } = {},
) {
  const input = CreateOrderInput.parse(rawInput);
  if (Number(input.amount) <= 0) throw new Error("amount must be greater than zero");
  const fetchImpl = options.fetchImpl ?? fetch;
  const appBaseUrl = getAppBaseUrl();
  const order = await paypalRequest("/v2/checkout/orders", {
    method: "POST",
    headers: { "PayPal-Request-Id": input.requestId },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{
        description: input.description,
        custom_id: input.requestId,
        invoice_id: input.requestId,
        amount: { currency_code: input.currency, value: input.amount },
      }],
      application_context: {
        return_url: `${appBaseUrl}/checkout.html?paypal=return`,
        cancel_url: `${appBaseUrl}/checkout.html?paypal=cancel`,
        user_action: "PAY_NOW",
      },
    }),
  }, fetchImpl);
  const parsed = z.object({
    id: z.string().min(1),
    status: z.string(),
    links: z.array(z.object({ href: z.string().url(), rel: z.string() })).optional(),
  }).passthrough().parse(order);
  const approval = parsed.links?.find((link) => link.rel === "approve" || link.rel === "payer-action");
  return { id: parsed.id, status: parsed.status, approvalUrl: approval?.href ?? null, environment: "sandbox" as const };
}

export async function capturePayPalSandboxOrder(
  rawInput: unknown,
  options: { fetchImpl?: Fetcher } = {},
) {
  const input = CaptureOrderInput.parse(rawInput);
  if (Number(input.expectedAmount) <= 0) throw new Error("expectedAmount must be greater than zero");
  const fetchImpl = options.fetchImpl ?? fetch;

  const order = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(input.orderId)}`, {
    method: "GET",
  }, fetchImpl);
  const current = z.object({
    id: z.string(),
    status: z.string(),
    purchase_units: z.array(z.object({
      custom_id: z.string(),
      invoice_id: z.string().optional(),
      amount: z.object({ currency_code: z.string(), value: z.string() }),
    })).min(1),
  }).passthrough().parse(order);

  if (current.id !== input.orderId || current.status !== "APPROVED") {
    throw new Error("PayPal order is not approved for capture");
  }
  if (
    current.purchase_units.length !== 1 ||
    current.purchase_units[0].custom_id !== input.requestId ||
    current.purchase_units[0].amount.currency_code !== input.currency ||
    current.purchase_units[0].amount.value !== input.expectedAmount
  ) {
    throw new Error("PayPal order amount/currency does not match the approved request");
  }

  const captured = await paypalRequest(
    `/v2/checkout/orders/${encodeURIComponent(input.orderId)}/capture`,
    {
      method: "POST",
      headers: { "PayPal-Request-Id": input.requestId },
      body: "{}",
    },
    fetchImpl,
  );
  const result = z.object({ id: z.string(), status: z.string() }).passthrough().parse(captured);
  if (result.status !== "COMPLETED") {
    throw new Error(`PayPal capture not completed (status ${result.status})`);
  }
  return { id: result.id, status: result.status, environment: "sandbox" as const, humanApproved: true };
}


export async function verifyPayPalWebhookSignature(
  headers: {
    authAlgo: string;
    certUrl: string;
    transmissionId: string;
    transmissionSignature: string;
    transmissionTime: string;
  },
  event: unknown,
  options: { fetchImpl?: Fetcher } = {},
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    throw new PayPalConfigurationError("PAYPAL_WEBHOOK_ID is not configured");
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const result = await paypalRequest("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: JSON.stringify({
      auth_algo: headers.authAlgo,
      cert_url: headers.certUrl,
      transmission_id: headers.transmissionId,
      transmission_sig: headers.transmissionSignature,
      transmission_time: headers.transmissionTime,
      webhook_id: webhookId,
      webhook_event: event,
    }),
  }, fetchImpl);
  const parsed = z.object({
    verification_status: z.enum(["SUCCESS", "FAILURE"]),
  }).passthrough().parse(result);
  return parsed.verification_status === "SUCCESS";
}
