import { randomUUID } from "node:crypto";

export interface PayPalLink { href: string; rel: string; method: string }
export interface PayPalOrder { id: string; status: string; links: PayPalLink[]; approveUrl?: string }
export interface PayPalOrderDetails {
  id: string;
  status: string;
  purchase_units?: Array<{ amount?: { currency_code?: string; value?: string }; payments?: { captures?: Array<{ id: string; status: string }> } }>;
}
export interface PayPalWebhookHeaders {
  transmissionId: string;
  transmissionTime: string;
  certUrl: string;
  authAlgo: string;
  transmissionSig: string;
}

/** PayPal Orders v2 client. Creating an order never captures funds. */
export class PayPalClient {
  private clientId = process.env.PAYPAL_CLIENT_ID || "";
  private clientSecret = process.env.PAYPAL_CLIENT_SECRET || "";
  private webhookId = process.env.PAYPAL_WEBHOOK_ID || "";
  private baseUrl: string;
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  constructor() {
    const mode = (process.env.PAYPAL_MODE || "sandbox").trim().toLowerCase();
    if (mode !== "sandbox" && mode !== "live") throw new Error("PAYPAL_MODE must be sandbox or live");
    if (mode === "live" && process.env.PAYPAL_LIVE_ENABLED !== "true") {
      throw new Error("PayPal live mode is locked; set PAYPAL_LIVE_ENABLED=true only after explicit payment review.");
    }
    this.baseUrl = mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  }

  private async getAccessToken(): Promise<string> {
    if (!this.isConfigured()) throw new Error("paypal_credentials_missing");
    if (this.accessToken && Date.now() < this.tokenExpiry) return this.accessToken;
    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw new Error(`PayPal auth failed: ${res.status} ${await res.text()}`);
    const data = await res.json() as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + Math.max(0, data.expires_in - 60) * 1000;
    return this.accessToken;
  }

  async createOrder(amountUsd: number, description = "ChannelSwarm agent settlement", requestId = randomUUID()): Promise<PayPalOrder> {
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) throw new Error("paypal_amount_must_be_positive");
    const token = await this.getAccessToken();
    const body = {
      intent: "CAPTURE",
      purchase_units: [{ amount: { currency_code: "USD", value: amountUsd.toFixed(2) }, description }],
      application_context: {
        brand_name: "ChannelSwarm",
        user_action: "PAY_NOW",
        return_url: process.env.PAYPAL_RETURN_URL || "http://localhost:3000/paypal/return",
        cancel_url: process.env.PAYPAL_CANCEL_URL || "http://localhost:3000/paypal/cancel",
      },
    };
    const res = await fetch(`${this.baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "PayPal-Request-Id": requestId },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PayPal createOrder failed: ${res.status} ${await res.text()}`);
    const order = await res.json() as PayPalOrder;
    order.approveUrl = order.links?.find((link) => link.rel === "approve" || link.rel === "payer-action")?.href;
    if (!order.id) throw new Error("paypal_order_id_missing");
    return order;
  }

  async getOrder(orderId: string): Promise<PayPalOrderDetails> {
    if (!orderId.trim()) throw new Error("paypal_order_id_required");
    const token = await this.getAccessToken();
    const res = await fetch(`${this.baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`PayPal getOrder failed: ${res.status} ${await res.text()}`);
    return await res.json() as PayPalOrderDetails;
  }

  async captureOrder(orderId: string, requestId = randomUUID()): Promise<PayPalOrderDetails> {
    if (!orderId.trim()) throw new Error("paypal_order_id_required");
    const token = await this.getAccessToken();
    const res = await fetch(`${this.baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "PayPal-Request-Id": requestId },
    });
    if (!res.ok) throw new Error(`PayPal capture failed: ${res.status} ${await res.text()}`);
    return await res.json() as PayPalOrderDetails;
  }

  /** Verify a webhook with PayPal before trusting its event payload. */
  async verifyWebhook(headers: PayPalWebhookHeaders, event: unknown): Promise<boolean> {
    if (!this.webhookId) throw new Error("paypal_webhook_id_missing");
    if (Object.values(headers).some((value) => !value)) throw new Error("paypal_webhook_headers_missing");
    const token = await this.getAccessToken();
    const res = await fetch(`${this.baseUrl}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_algo: headers.authAlgo,
        cert_url: headers.certUrl,
        transmission_id: headers.transmissionId,
        transmission_sig: headers.transmissionSig,
        transmission_time: headers.transmissionTime,
        webhook_id: this.webhookId,
        webhook_event: event,
      }),
    });
    if (!res.ok) throw new Error(`PayPal webhook verification failed: ${res.status} ${await res.text()}`);
    const result = await res.json() as { verification_status?: string };
    return result.verification_status === "SUCCESS";
  }

  isConfigured(): boolean { return Boolean(this.clientId && this.clientSecret); }
}