export type PaymentRail = "solana" | "paypal" | "manual_review";

export interface RailAdvice {
  rail: PaymentRail;
  reason: string;
}

export function recommendRailByRules(amountUsd: number, purpose: string): RailAdvice {
  const text = purpose.toLowerCase();
  if (/refund|dispute|unknown|chargeback|high risk/.test(text)) {
    return { rail: "manual_review", reason: "The request mentions a risk, refund, or dispute; an operator should review it." };
  }
  if (/micropayment|machine|agent|api call|per request|stream/.test(text) || amountUsd < 1) {
    return { rail: "solana", reason: "A low-value or machine-to-machine payment fits the low-friction channel flow, if the payer is funded." };
  }
  if (/fiat|customer checkout|paypal|card|familiar checkout/.test(text) || amountUsd >= 10) {
    return { rail: "paypal", reason: "A conventional checkout flow is more suitable for this customer-facing amount or preference." };
  }
  return { rail: "manual_review", reason: "Compare payer wallet readiness, fees, and customer preference before choosing a rail." };
}

export function parseRailAdvice(content: string): RailAdvice | null {
  const normalized = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const value = JSON.parse(normalized) as { rail?: unknown; reason?: unknown };
    if (
      (value.rail === "solana" || value.rail === "paypal" || value.rail === "manual_review") &&
      typeof value.reason === "string" && value.reason.trim().length > 0
    ) {
      return { rail: value.rail, reason: value.reason.trim().slice(0, 300) };
    }
  } catch {
    return null;
  }
  return null;
}
