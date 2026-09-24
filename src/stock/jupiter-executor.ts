import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";

const JUPITER_URL = process.env.JUPITER_API_URL ?? "https://api.jup.ag/swap/v1";
const USDC_MINT = process.env.USDC_MINT ?? "";

const STOCK_MINTS: Record<string, string | undefined> = {
  AAPL: process.env.XSTOCK_AAPL_MINT,
  TSLA: process.env.XSTOCK_TSLA_MINT,
  NVDA: process.env.XSTOCK_NVDA_MINT,
  MSFT: process.env.XSTOCK_MSFT_MINT,
};

function headers(): Record<string, string> {
  const key = process.env.JUPITER_API_KEY;
  return key ? { "x-api-key": key } : {};
}

function mintFor(symbol: string): string {
  const mint = STOCK_MINTS[symbol.toUpperCase()];
  if (!mint) throw new Error(`missing_xstock_mint:${symbol.toUpperCase()}`);
  return mint;
}

/** True when XSTOCK_<SYMBOL>_MINT is configured. */
export function hasXStockMint(symbol: string): boolean {
  const mint = STOCK_MINTS[symbol.toUpperCase()];
  return Boolean(mint && mint.trim());
}

export function configuredXStockSymbols(): string[] {
  return Object.entries(STOCK_MINTS)
    .filter(([, mint]) => Boolean(mint && mint.trim()))
    .map(([symbol]) => symbol);
}

function amountToBaseUnits(value: number, decimals: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("trade amount must be greater than zero");
  }
  const units = Math.round(value * 10 ** decimals);
  return String(units);
}

export interface JupiterTradeResult {
  txSignature: string;
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
}

/**
 * Execute a Jupiter swap for tokenized equity (xStock) mints.
 *
 * - buy:  `amount` is USDC human units (6 decimals)
 * - sell: `amount` is stock token human units (mint decimals)
 */
export async function executeJupiterXStockTrade(
  connection: Connection,
  wallet: Keypair,
  symbol: string,
  side: "buy" | "sell",
  amount: number,
  slippageBps = Number(process.env.JUPITER_SLIPPAGE_BPS ?? 100),
): Promise<JupiterTradeResult> {
  if (!USDC_MINT) throw new Error("missing_USDC_MINT");

  const stockMint = mintFor(symbol);
  const stockMintPk = new PublicKey(stockMint);
  const inputMint = side === "buy" ? USDC_MINT : stockMint;
  const outputMint = side === "buy" ? stockMint : USDC_MINT;

  const decimals =
    side === "buy" ? 6 : (await getMint(connection, stockMintPk)).decimals;

  const amountBase = amountToBaseUnits(amount, decimals);
  const query = new URLSearchParams({
    inputMint,
    outputMint,
    amount: amountBase,
    slippageBps: String(slippageBps),
    restrictIntermediateTokens: "true",
  });

  const quoteResponse = await fetch(`${JUPITER_URL}/quote?${query}`, {
    headers: headers(),
  });
  if (!quoteResponse.ok) {
    throw new Error(
      `jupiter_quote_failed:${quoteResponse.status}:${await quoteResponse.text()}`,
    );
  }

  const quote = (await quoteResponse.json()) as {
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
  };

  const swapResponse = await fetch(`${JUPITER_URL}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: wallet.publicKey.toBase58(),
      dynamicComputeUnitLimit: true,
      dynamicSlippage: true,
    }),
  });

  if (!swapResponse.ok) {
    throw new Error(
      `jupiter_swap_build_failed:${swapResponse.status}:${await swapResponse.text()}`,
    );
  }

  const swap = (await swapResponse.json()) as { swapTransaction?: string };
  if (!swap.swapTransaction) throw new Error("jupiter_swap_transaction_missing");

  const transaction = VersionedTransaction.deserialize(
    Buffer.from(swap.swapTransaction, "base64"),
  );
  transaction.sign([wallet]);

  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    maxRetries: 2,
  });
  await connection.confirmTransaction(signature, "confirmed");

  return {
    txSignature: signature,
    inputMint: quote.inputMint,
    outputMint: quote.outputMint,
    inputAmount: quote.inAmount,
    outputAmount: quote.outAmount,
  };
}
