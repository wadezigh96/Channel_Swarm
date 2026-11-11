import { loadJson, saveJson } from "../persistence.js";

export interface PayPalOrderRecord {
  orderId: string;
  status: string;
  amount: string;
  currency: "USD";
  description: string;
  createdAt: string;
  updatedAt: string;
  captureId?: string;
  lastEventId?: string;
}

const ORDER_STATUS_RANK: Record<string, number> = {
  CREATED: 0,
  APPROVED: 1,
  PENDING: 2,
  COMPLETED: 3,
  DENIED: 3,
  VOIDED: 3,
  PARTIALLY_REFUNDED: 4,
  REFUND_REVIEW: 4,
  REFUNDED: 5,
  REVERSED: 6,
};

export function mergePayPalOrderRecords(
  existing: PayPalOrderRecord,
  incoming: PayPalOrderRecord
): PayPalOrderRecord {
  const previousRank = ORDER_STATUS_RANK[existing.status] ?? 0;
  const incomingRank = ORDER_STATUS_RANK[incoming.status] ?? 0;
  const incomingStatusWins = incomingRank > previousRank ||
    (incomingRank === previousRank && incoming.status === existing.status);
  return {
    ...existing,
    status: incomingStatusWins ? incoming.status : existing.status,
    updatedAt: incoming.updatedAt > existing.updatedAt ? incoming.updatedAt : existing.updatedAt,
    ...(incoming.captureId ? { captureId: incoming.captureId } : {}),
    ...(incoming.lastEventId ? { lastEventId: incoming.lastEventId } : {}),
  };
}

type RedisResult<T> = { result?: T; error?: string };
const LOCAL_ORDERS_FILE = "paypal-orders.json";
const LOCAL_RATE_LIMITS = new Map<string, { count: number; expiresAt: number }>();

export class PayPalOrderLedger {
  private readonly redisUrl = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "") || "";
  private readonly redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || "";

  isPersistentStoreConfigured(): boolean {
    return Boolean(this.redisUrl && this.redisToken) || process.env.VERCEL !== "1";
  }

  private async redis<T>(...args: Array<string | number>): Promise<T> {
    if (!this.redisUrl || !this.redisToken) throw new Error("Persistent PayPal ledger is not configured.");
    const response = await fetch(this.redisUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.redisToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    if (!response.ok) throw new Error(`Ledger storage request failed (${response.status}).`);
    const result = (await response.json()) as RedisResult<T>;
    if (result.error) throw new Error("Ledger storage rejected the request.");
    return result.result as T;
  }

  async getOrder(orderId: string): Promise<PayPalOrderRecord | null> {
    if (this.redisUrl && this.redisToken) {
      const value = await this.redis<string | null>("GET", `channelswarm:paypal:order:${orderId}`);
      return value ? (JSON.parse(value) as PayPalOrderRecord) : null;
    }
    this.assertLocalStorageAllowed();
    const orders = loadJson<Record<string, PayPalOrderRecord>>(LOCAL_ORDERS_FILE, {});
    return orders[orderId] || null;
  }

  async putOrder(record: PayPalOrderRecord): Promise<void> {
    if (this.redisUrl && this.redisToken) {
      const script = `
        local incoming = cjson.decode(ARGV[1])
        local current = redis.call('GET', KEYS[1])
        if not current then
          redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
          return 'OK'
        end
        local existing = cjson.decode(current)
        local ranks = cjson.decode(ARGV[3])
        local previousRank = ranks[existing.status] or 0
        local incomingRank = ranks[incoming.status] or 0
        if incomingRank > previousRank or (incomingRank == previousRank and incoming.status == existing.status) then
          existing.status = incoming.status
        end
        if not existing.updatedAt or (incoming.updatedAt and incoming.updatedAt > existing.updatedAt) then
          existing.updatedAt = incoming.updatedAt
        end
        if incoming.captureId then existing.captureId = incoming.captureId end
        if incoming.lastEventId then existing.lastEventId = incoming.lastEventId end
        redis.call('SET', KEYS[1], cjson.encode(existing), 'EX', ARGV[2])
        return 'OK'
      `;
      await this.redis(
        "EVAL",
        script,
        1,
        `channelswarm:paypal:order:${record.orderId}`,
        JSON.stringify(record),
        31_536_000,
        JSON.stringify(ORDER_STATUS_RANK)
      );
      return;
    }
    this.assertLocalStorageAllowed();
    const orders = loadJson<Record<string, PayPalOrderRecord>>(LOCAL_ORDERS_FILE, {});
    const existing = orders[record.orderId];
    orders[record.orderId] = existing ? mergePayPalOrderRecords(existing, record) : record;
    saveJson(LOCAL_ORDERS_FILE, orders);
  }

  async markWebhookEvent(eventId: string): Promise<boolean> {
    if (this.redisUrl && this.redisToken) {
      const result = await this.redis<string | null>(
        "SET",
        `channelswarm:paypal:event:${eventId}`,
        "1",
        "NX",
        "EX",
        31_536_000
      );
      return result === "OK";
    }
    this.assertLocalStorageAllowed();
    const key = `paypal:event:${eventId}`;
    const events = loadJson<Record<string, boolean>>("paypal-events.json", {});
    if (events[key]) return false;
    events[key] = true;
    saveJson("paypal-events.json", events);
    return true;
  }

  async allowCreateForIp(ip: string, maxRequests = 5, windowSeconds = 3600): Promise<boolean> {
    return this.allowRequestForIp("paypal-create", ip, maxRequests, windowSeconds);
  }

  async allowRequestForIp(
    scope: string,
    ip: string,
    maxRequests: number,
    windowSeconds: number
  ): Promise<boolean> {
    if (this.redisUrl && this.redisToken) {
      const script = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n";
      const count = await this.redis<number>(
        "EVAL",
        script,
        1,
        `channelswarm:rate:${scope}:${ip}`,
        windowSeconds
      );
      return count <= maxRequests;
    }
    this.assertLocalStorageAllowed();
    const now = Date.now();
    const current = LOCAL_RATE_LIMITS.get(ip);
    if (!current || current.expiresAt <= now) {
      LOCAL_RATE_LIMITS.set(ip, { count: 1, expiresAt: now + windowSeconds * 1000 });
      return true;
    }
    current.count += 1;
    return current.count <= maxRequests;
  }

  private assertLocalStorageAllowed(): void {
    if (process.env.VERCEL === "1") {
      throw new Error("Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for durable serverless storage.");
    }
  }
}
