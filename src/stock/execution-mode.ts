/**
 * Unified execution mode for tokenized-equity trades.
 *
 *   paper    — in-memory portfolio (default, safe for demos/CI)
 *   backpack — Backpack STOCK RFQ (requires API keys + BACKPACK_LIVE_TRADING)
 *   jupiter  — on-chain Jupiter swap of xStock mints (requires USDC_MINT + XSTOCK_*_MINT + funded wallet)
 *
 * Legacy: BACKPACK_LIVE_TRADING=true without EXECUTION_MODE maps to backpack.
 */
export type ExecutionMode = "paper" | "backpack" | "jupiter";

export function resolveExecutionMode(): ExecutionMode {
  const raw = (process.env.EXECUTION_MODE ?? "").trim().toLowerCase();
  if (raw === "paper" || raw === "backpack" || raw === "jupiter") {
    return raw;
  }
  if (process.env.BACKPACK_LIVE_TRADING === "true") {
    return "backpack";
  }
  return "paper";
}

export function isLiveExecution(mode: ExecutionMode = resolveExecutionMode()): boolean {
  return mode === "backpack" || mode === "jupiter";
}
