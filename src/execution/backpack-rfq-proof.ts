import nacl from "tweetnacl";

const BASE_URL = process.env.BACKPACK_API_URL ?? "https://api.backpack.exchange";
const WINDOW = 5000;

function sortedQuery(values: Record<string, unknown>): string {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("&");
}

function secretKey(): Uint8Array {
  const value = process.env.BACKPACK_API_SECRET;
  if (!value) throw new Error("BACKPACK_API_SECRET is not configured");
  const bytes = Buffer.from(value, "base64");
  if (bytes.length !== 32) throw new Error("BACKPACK_API_SECRET must be a base64-encoded 32-byte Ed25519 seed");
  return nacl.sign.keyPair.fromSeed(bytes).secretKey;
}

export interface RfqExecutionProof {
  rfqId: string;
  symbol?: string;
  status?: string;
  price?: string;
  executedQuantity?: string;
  executedQuoteQuantity?: string;
}

export async function getRfqExecutionProof(rfqId: string): Promise<RfqExecutionProof> {
  if (!rfqId) throw new Error("rfqId is required");

  const apiKey = process.env.BACKPACK_API_KEY;
  if (!apiKey) throw new Error("BACKPACK_API_KEY is not configured");

  const params = { rfqId };
  const query = sortedQuery(params);
  const timestamp = Date.now();
  const payload = `instruction=rfqHistoryQueryAll&${query}&timestamp=${timestamp}&window=${WINDOW}`;

  const signature = nacl.sign.detached(
    Buffer.from(payload, "utf8"),
    secretKey()
  );

  const url = new URL(`${BASE_URL}/api/v1/rfq/history`);
  url.searchParams.set("rfqId", rfqId);

  const response = await fetch(url, {
    headers: {
      "X-API-KEY": apiKey,
      "X-SIGNATURE": Buffer.from(signature).toString("base64"),
      "X-TIMESTAMP": String(timestamp),
      "X-WINDOW": String(WINDOW),
    },
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`Backpack RFQ history ${response.status}: ${text}`);

  const history = JSON.parse(text) as RfqExecutionProof[];
  const filled = history.find((item) => item.status === "Filled");

  if (!filled) {
    throw new Error(`RFQ ${rfqId} has no Filled execution record`);
  }

  return filled;
}
