import { randomUUID } from "node:crypto";

export interface PayPalLink { href: string; rel: string; method: string }
export interface PayPalOrder { id: string; status: string; links: PayPalLink[]; approveUrl?: string }
export interface PayPalOrderDetails {
  id: string;
  status: string;
  purchase_units?: Array<{
    custom_id?: string;
    invoice_id?: string;
    amount?: { currency_code?: string; value?: string };
    payments?: {
      captures?: Array<{
        id: string;
        status: string;
        amount?: { currency_code?: string; value?: string };
      }>;
    };
  }>;
}
export interface PayPalWebhookHeaders {
  transmissionId: string;
  transmissionTime: string;
  certUrl: string;
  authAlgo: string;
  transmissionSig: string;
}

/** Server-side PayPal Orders v2 client. Live capture has an independent kill switch. */
export class PayPalClient {
  private clientId = process.env.PAYPAL_CLIENT_ID || "";
  private clientSecret = process.env.PAYPAL_CLIENT_SECRET || "";
  private webhookId = process.env.PAYPAL_WEBHOOK_ID || "";
  private baseUrl: string;
  readonly mode: "sandbox" | "live";
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  constructor() {
    const mode = (process.env.PAYPAL_MODE || "sandbox").trim().toLowerCase();
    if (mode !== "sandbox" && mode !== "live") throw new Error("PAYPAL_MODE must be sandbox or live");
    if (mode === "live" && process.env.PAYPAL_LIVE_ENABLED !== "true") {
      throw new Error("PayPal live mode is locked; explicit PAYPAL_LIVE_ENABLED=true required.");
    }
    this.mode = mode;
    this.baseUrl = mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  }

  private async getAccessToken(): Promise<string> {
    if (!this.isConfigured()) throw new Error("paypal_credentials_missing");
    if (this.accessToken && Date.now() < this.tokenExpiry) return this.accessToken;
    const auth = Buffer.from(this.clientId + ":" + this.clientSecret).toString("base64");
    const res = await fetch(this.baseUrl + "/v1/oauth2/token", {
      method: "POST",
      headers: { Authorization: "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw new Error("PayPal auth failed: " + res.status);
    const data = await res.json() as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + Math.max(0, data.expires_in - 60) * 1000;
    return this.accessToken;
  }

  async createOrder(amountUsd: number, description = "ChannelSwarm agent settlement", requestId: string = randomUUID()): Promise<PayPalOrder> {
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) throw new Error("paypal_amount_must_be_positive");
    if (!requestId || requestId.length > 38) throw new Error("paypal_request_id_must_be_1_to_38_characters");
    if (this.mode === "live") {
      for (const key of ["PAYPAL_RETURN_URL", "PAYPAL_CANCEL_URL"] as const) {
        const value = process.env[key] || "";
        if (!value.startsWith("https://") || /localhost|127\.0\.0\.1/i.test(value)) {
          throw new Error(key + "_must_be_a_public_https_url_for_live_payments");
        }
      }
      if (!this.webhookId) throw new Error("paypal_webhook_id_required_for_live_payments");
    }
    const token = await this.getAccessToken();
    const body = {
      intent: "CAPTURE",
      purchase_units: [{
        custom_id: requestId,
        invoice_id: requestId,
        amount: { currency_code: "USD", value: amountUsd.toFixed(2) },
        description,
      }],
      application_context: {
        brand_name: "ChannelSwarm",
        user_action: "PAY_NOW",
        return_url: process.env.PAYPAL_RETURN_URL || "http://localhost:3000/paypal/return",
        cancel_url: process.env.PAYPAL_CANCEL_URL || "http://localhost:3000/paypal/cancel",
      },
    };
    const res = await fetch(this.baseUrl + "/v2/checkout/orders", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", "PayPal-Request-Id": requestId },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("PayPal createOrder failed: " + res.status);
    const order = await res.json() as PayPalOrder;
    order.approveUrl = order.links?.find(x => x.rel === "approve" || x.rel === "payer-action")?.href;
    if (!order.id) throw new Error("paypal_order_id_missing");
    return order;
  }

  async getOrder(id: string): Promise<PayPalOrderDetails> {
    if (!id.trim()) throw new Error("paypal_order_id_required");
    const token = await this.getAccessToken();
    const res = await fetch(this.baseUrl + "/v2/checkout/orders/" + encodeURIComponent(id), {
      headers: { Authorization: "Bearer " + token },
    });
    if (!res.ok) throw new Error("PayPal getOrder failed: " + res.status);
    return await res.json() as PayPalOrderDetails;
  }

  async captureOrder(id: string, requestId: string = randomUUID()): Promise<PayPalOrderDetails> {
    if (!id.trim()) throw new Error("paypal_order_id_required");
    if (this.mode === "live" && process.env.PAYPAL_LIVE_CAPTURE_ENABLED !== "true") {
      throw new Error("PayPal live capture locked; explicit PAYPAL_LIVE_CAPTURE_ENABLED=true is required.");
    }
    if (!requestId || requestId.length > 38) throw new Error("paypal_request_id_must_be_1_to_38_characters");
    const token = await this.getAccessToken();
    const res = await fetch(this.baseUrl + "/v2/checkout/orders/" + encodeURIComponent(id) + "/capture", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", "PayPal-Request-Id": requestId },
    });
    if (!res.ok) throw new Error("PayPal capture failed: " + res.status);
    return await res.json() as PayPalOrderDetails;
  }

  async verifyWebhook(headers: PayPalWebhookHeaders, event: unknown): Promise<boolean> {
    if (!this.webhookId) throw new Error("paypal_webhook_id_missing");
    if (Object.values(headers).some(v => !v)) throw new Error("paypal_webhook_headers_missing");
    const token = await this.getAccessToken();
    const res = await fetch(this.baseUrl + "/v1/notifications/verify-webhook-signature", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_algo: headers.authAlgo, cert_url: headers.certUrl,
        transmission_id: headers.transmissionId, transmission_sig: headers.transmissionSig,
        transmission_time: headers.transmissionTime, webhook_id: this.webhookId,
        webhook_event: event,
      }),
    });
    if (!res.ok) throw new Error("PayPal webhook verification failed: " + res.status);
    const result = await res.json() as { verification_status?: string };
    return result.verification_status === "SUCCESS";
  }

  async verifyWebhookSignature(
    headers: { auth_algo: string; cert_url: string; transmission_id: string; transmission_sig: string; transmission_time: string },
    _webhookId: string,
    event: unknown
  ): Promise<boolean> {
    return this.verifyWebhook({
      authAlgo: headers.auth_algo,
      certUrl: headers.cert_url,
      transmissionId: headers.transmission_id,
      transmissionSig: headers.transmission_sig,
      transmissionTime: headers.transmission_time,
    }, event);
  }

  async getCapture(id: string): Promise<{ status: string }> {
    if (!id.trim()) throw new Error("paypal_capture_id_required");
    const token = await this.getAccessToken();
    const res = await fetch(this.baseUrl + "/v2/payments/captures/" + encodeURIComponent(id), {
      headers: { Authorization: "Bearer " + token },
    });
    if (!res.ok) throw new Error("PayPal getCapture failed: " + res.status);
    return await res.json() as { status: string };
  }

  isConfigured(): boolean { return Boolean(this.clientId && this.clientSecret); }
}
