import { createHash, randomUUID } from "node:crypto";

/** Server-side PayPal Orders v2 client. Credentials never leave the server. */
export interface PayPalOrder {
  id: string;
  status: string;
  links: { href: string; rel: string; method: string }[];
  approveUrl?: string;
  purchase_units?: Array<{
    amount?: { currency_code?: string; value?: string };
    payments?: { captures?: Array<{ id: string; status: string }> };
  }>;
}

export interface PayPalCapture {
  id: string;
  status: string;
  amount?: { currency_code?: string; value?: string };
}

export interface PayPalWebhookHeaders {
  auth_algo: string;
  cert_url: string;
  transmission_id: string;
  transmission_sig: string;
  transmission_time: string;
}

export class PayPalClient {
  private readonly clientId = process.env.PAYPAL_CLIENT_ID || "";
  private readonly clientSecret = process.env.PAYPAL_CLIENT_SECRET || "";
  private readonly liveMode = (process.env.PAYPAL_MODE || "sandbox").toLowerCase() === "live";
  private readonly baseUrl: string;
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  constructor() {
    if (this.liveMode && process.env.PAYPAL_ALLOW_LIVE !== "true") {
      throw new Error("Live PayPal is disabled; enable it only after production validation.");
    }
    this.baseUrl = this.liveMode
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  private async getAccessToken(): Promise<string> {
    if (!this.isConfigured()) throw new Error("PayPal credentials are not configured.");
    if (this.accessToken && Date.now() < this.tokenExpiry) return this.accessToken;
    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const response = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!response.ok) throw new Error(`PayPal authentication failed (${response.status}).`);
    const data = (await response.json()) as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + Math.max(0, data.expires_in - 60) * 1000;
    return this.accessToken;
  }

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.getAccessToken();
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    if (!response.ok) throw new Error(`PayPal request failed (${response.status}).`);
    return (await response.json()) as T;
  }

  async createOrder(
    amountUsd: number,
    description: string,
    requestId = randomUUID()
  ): Promise<PayPalOrder> {
    const appUrl = (process.env.APP_URL || "https://swarm-agent-beta.vercel.app").replace(/\/$/, "");
    const order = await this.api<PayPalOrder>("/v2/checkout/orders", {
      method: "POST",
      headers: { "PayPal-Request-Id": requestId },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{ amount: { currency_code: "USD", value: amountUsd.toFixed(2) }, description }],
        application_context: {
          brand_name: "ChannelSwarm",
          user_action: "PAY_NOW",
          return_url: `${appUrl}/?paypal=return`,
          cancel_url: `${appUrl}/?paypal=cancel`,
        },
      }),
    });
    order.approveUrl = order.links?.find((link) => link.rel === "approve" || link.rel === "payer-action")?.href;
    return order;
  }

  async getOrder(orderId: string): Promise<PayPalOrder> {
    return this.api<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  }

  async getCapture(captureId: string): Promise<PayPalCapture> {
    return this.api<PayPalCapture>(`/v2/payments/captures/${encodeURIComponent(captureId)}`);
  }

  async captureOrder(
    orderId: string,
    requestId = `cs-capture-${createHash("sha256").update(orderId).digest("hex").slice(0, 27)}`
  ): Promise<PayPalOrder> {
    return this.api<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST",
      headers: { "PayPal-Request-Id": requestId },
      body: JSON.stringify({}),
    });
  }

  async verifyWebhookSignature(
    headers: PayPalWebhookHeaders,
    webhookId: string,
    event: unknown
  ): Promise<boolean> {
    const result = await this.api<{ verification_status?: string }>(
      "/v1/notifications/verify-webhook-signature",
      {
        method: "POST",
        body: JSON.stringify({
          auth_algo: headers.auth_algo,
          cert_url: headers.cert_url,
          transmission_id: headers.transmission_id,
          transmission_sig: headers.transmission_sig,
          transmission_time: headers.transmission_time,
          webhook_id: webhookId,
          webhook_event: event,
        }),
      }
    );
    return result.verification_status === "SUCCESS";
  }
}
