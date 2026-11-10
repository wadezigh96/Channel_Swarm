/**
 * PayPal Sandbox Client for ChannelSwarm
 * Uses Orders v2 API for agent-to-human or dual-rail settlement.
 *
 * Credentials from env:
 *   PAYPAL_CLIENT_ID
 *   PAYPAL_CLIENT_SECRET
 *   PAYPAL_MODE=sandbox (default)
 */

export interface PayPalOrder {
  id: string;
  status: string;
  links: { href: string; rel: string; method: string }[];
  approveUrl?: string;
}

export class PayPalClient {
  private clientId: string;
  private clientSecret: string;
  private baseUrl: string;
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  constructor() {
    this.clientId = process.env.PAYPAL_CLIENT_ID || "";
    this.clientSecret = process.env.PAYPAL_CLIENT_SECRET || "";
    const mode = process.env.PAYPAL_MODE || "sandbox";
    this.baseUrl =
      mode === "live"
        ? "https://api-m.paypal.com"
        : "https://api-m.sandbox.paypal.com";

    if (!this.clientId || !this.clientSecret) {
      console.warn("[PayPal] Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET — sandbox calls will fail");
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`PayPal auth failed: ${res.status} ${err}`);
    }

    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken;
  }

  /**
   * Create a PayPal Order (CAPTURE intent) for agent settlement.
   * Returns order ID + approval URL.
   */
  async createOrder(amountUsd: number, description = "ChannelSwarm agent settlement"): Promise<PayPalOrder> {
    const token = await this.getAccessToken();
    const body = {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "USD",
            value: amountUsd.toFixed(2),
          },
          description,
        },
      ],
      application_context: {
        brand_name: "ChannelSwarm",
        user_action: "PAY_NOW",
        return_url: "https://swarm-agent-beta.vercel.app/",
        cancel_url: "https://swarm-agent-beta.vercel.app/",
      },
    };

    const res = await fetch(`${this.baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `channelswarm-${Date.now()}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`PayPal createOrder failed: ${res.status} ${err}`);
    }

    const order = (await res.json()) as PayPalOrder;
    order.approveUrl = order.links?.find((l) => l.rel === "approve")?.href;
    console.log(`[PayPal] Created order ${order.id} — ${amountUsd} USD`);
    if (order.approveUrl) console.log(`[PayPal] Approve URL: ${order.approveUrl}`);
    return order;
  }

  /**
   * Capture an approved order.
   */
  async captureOrder(orderId: string): Promise<{ status: string; id: string }> {
    const token = await this.getAccessToken();
    const res = await fetch(`${this.baseUrl}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`PayPal capture failed: ${res.status} ${err}`);
    }

    const data = (await res.json()) as { status: string; id: string };
    console.log(`[PayPal] Captured order ${orderId} → status=${data.status}`);
    return data;
  }

  /**
   * Get order details.
   */
  async getOrder(orderId: string): Promise<unknown> {
    const token = await this.getAccessToken();
    const res = await fetch(`${this.baseUrl}/v2/checkout/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`getOrder failed: ${res.status}`);
    return res.json();
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }
}
