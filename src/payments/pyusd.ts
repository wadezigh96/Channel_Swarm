import { randomUUID } from "node:crypto";
import bs58 from "bs58";
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  getTransferFeeConfig,
  getTransferHook,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { z } from "zod";

export const PYUSD_MAINNET_MINT = new PublicKey("2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo");
export const PYUSD_DECIMALS = 6;
export const SOLANA_MAINNET_GENESIS_HASH = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

const PaymentInput = z.object({
  payer: z.string().min(32).max(44),
  amount: z.string().regex(/^(?:0|[1-9]\d{0,4})\.\d{2}$/),
}).strict();

const VerifyInput = PaymentInput.extend({
  signature: z.string().min(80).max(100),
  requestId: z.string().uuid(),
}).strict();

export class PyusdConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PyusdConfigurationError";
  }
}

export function parsePyusdAmount(amount: string): bigint {
  if (!/^(?:0|[1-9]\d{0,4})\.\d{2}$/.test(amount)) {
    throw new Error("amount_must_be_usd_with_two_decimals");
  }
  const [whole, fraction] = amount.split(".");
  const atomic = BigInt(whole) * 1_000_000n + BigInt(fraction) * 10_000n;
  if (atomic < 10_000n || atomic > 10_000_000_000n) {
    throw new Error("amount_out_of_range");
  }
  return atomic;
}

function getMainnetConnection() {
  const endpoint = process.env.PYUSD_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  return new Connection(endpoint, "confirmed");
}

function getTreasuryWallet() {
  const raw = process.env.PYUSD_TREASURY_WALLET;
  if (!raw) throw new PyusdConfigurationError("PYUSD_TREASURY_WALLET is not configured");
  try {
    return new PublicKey(raw);
  } catch {
    throw new PyusdConfigurationError("PYUSD_TREASURY_WALLET is not a valid Solana address");
  }
}

export function buildPyusdTransferTransaction(args: {
  payer: PublicKey;
  recipient: PublicKey;
  amountAtomic: bigint;
  requestId: string;
  blockhash: string;
}): Transaction {
  const sourceAta = getAssociatedTokenAddressSync(
    PYUSD_MAINNET_MINT, args.payer, false, TOKEN_2022_PROGRAM_ID,
  );
  const destinationAta = getAssociatedTokenAddressSync(
    PYUSD_MAINNET_MINT, args.recipient, false, TOKEN_2022_PROGRAM_ID,
  );

  const transaction = new Transaction({
    feePayer: args.payer,
    recentBlockhash: args.blockhash,
  });
  transaction.add(
    createAssociatedTokenAccountIdempotentInstruction(
      args.payer,
      destinationAta,
      args.recipient,
      PYUSD_MAINNET_MINT,
      TOKEN_2022_PROGRAM_ID,
    ),
    createTransferCheckedInstruction(
      sourceAta,
      PYUSD_MAINNET_MINT,
      destinationAta,
      args.payer,
      args.amountAtomic,
      PYUSD_DECIMALS,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [],
      data: Buffer.from(`channelswarm:pyusd:${args.requestId}`, "utf8"),
    }),
  );
  return transaction;
}

function assertSupportedMint(mintInfo: Awaited<ReturnType<typeof getMint>>) {
  if (mintInfo.decimals !== PYUSD_DECIMALS) {
    throw new Error("pyusd_mint_decimals_changed");
  }
  const transferFee = getTransferFeeConfig(mintInfo);
  if (
    transferFee &&
    (transferFee.olderTransferFee.transferFeeBasisPoints !== 0 ||
      transferFee.newerTransferFee.transferFeeBasisPoints !== 0)
  ) {
    throw new Error("pyusd_transfer_fee_enabled_review_required");
  }
  const transferHook = getTransferHook(mintInfo);
  if (transferHook?.programId) {
    throw new Error("pyusd_transfer_hook_enabled_review_required");
  }
}

export async function createPyusdPayment(rawInput: unknown) {
  const input = PaymentInput.parse(rawInput);
  const amountAtomic = parsePyusdAmount(input.amount);
  const payer = new PublicKey(input.payer);
  const recipient = getTreasuryWallet();
  if (payer.equals(recipient)) throw new Error("payer_and_recipient_must_differ");

  const connection = getMainnetConnection();
  if (await connection.getGenesisHash() !== SOLANA_MAINNET_GENESIS_HASH) {
    throw new PyusdConfigurationError("PYUSD endpoint must use Solana Mainnet");
  }

  const mintInfo = await getMint(
    connection, PYUSD_MAINNET_MINT, "confirmed", TOKEN_2022_PROGRAM_ID,
  );
  assertSupportedMint(mintInfo);

  const sourceAta = getAssociatedTokenAddressSync(
    PYUSD_MAINNET_MINT, payer, false, TOKEN_2022_PROGRAM_ID,
  );
  const sourceAccount = await getAccount(
    connection, sourceAta, "confirmed", TOKEN_2022_PROGRAM_ID,
  );
  if (!sourceAccount.owner.equals(payer) || !sourceAccount.mint.equals(PYUSD_MAINNET_MINT)) throw new Error("payer_token_account_owner_or_mint_mismatch");
  if (sourceAccount.amount < amountAtomic) throw new Error("insufficient_pyusd_balance");

  const latest = await connection.getLatestBlockhash("confirmed");
  const requestId = randomUUID();
  const transaction = buildPyusdTransferTransaction({
    payer,
    recipient,
    amountAtomic,
    requestId,
    blockhash: latest.blockhash,
  });

  return {
    requestId,
    network: "solana-mainnet",
    asset: "PYUSD",
    mint: PYUSD_MAINNET_MINT.toBase58(),
    decimals: PYUSD_DECIMALS,
    amount: input.amount,
    amountAtomic: amountAtomic.toString(),
    payer: payer.toBase58(),
    recipient: recipient.toBase58(),
    destinationTokenAccount: getAssociatedTokenAddressSync(
      PYUSD_MAINNET_MINT, recipient, false, TOKEN_2022_PROGRAM_ID,
    ).toBase58(),
    lastValidBlockHeight: latest.lastValidBlockHeight,
    unsignedTransaction: transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    }).toString("base64"),
  };
}

export function verifyPyusdParsedTransaction(
  transaction: any,
  args: { payer: PublicKey; recipient: PublicKey; amountAtomic: bigint; requestId: string },
) {
  if (!transaction) throw new Error("transaction_not_finalized");
  if (transaction.meta?.err) throw new Error("transaction_failed");

  const accountKeys = transaction.transaction?.message?.accountKeys ?? [];
  const payerSigned = accountKeys.some((key: any) =>
    key.signer === true && new PublicKey(key.pubkey).equals(args.payer),
  );
  if (!payerSigned) throw new Error("payer_signature_missing");

  const sourceAta = getAssociatedTokenAddressSync(
    PYUSD_MAINNET_MINT, args.payer, false, TOKEN_2022_PROGRAM_ID,
  );
  const destinationAta = getAssociatedTokenAddressSync(
    PYUSD_MAINNET_MINT, args.recipient, false, TOKEN_2022_PROGRAM_ID,
  );

  const instructions = [
    ...(transaction.transaction.message.instructions ?? []),
    ...(transaction.meta.innerInstructions ?? []).flatMap((group: any) => group.instructions ?? []),
  ];
  const expectedMemo = `channelswarm:pyusd:${args.requestId}`;
  const memoFound = instructions.some((instruction: any) => {
    if (!instruction.programId || !new PublicKey(instruction.programId).equals(MEMO_PROGRAM_ID)) return false;
    if (typeof instruction.parsed === "string") return instruction.parsed === expectedMemo;
    if (typeof instruction.data !== "string") return false;
    try {
      return bs58.decode(instruction.data).toString("utf8") === expectedMemo;
    } catch {
      return false;
    }
  });
  if (!memoFound) throw new Error("payment_reference_mismatch");

  const transfers = instructions.filter((instruction: any) =>
    instruction.programId &&
    new PublicKey(instruction.programId).equals(TOKEN_2022_PROGRAM_ID) &&
    instruction.parsed?.type === "transferChecked",
  );
  const matches = transfers.filter((instruction: any) => {
    const info = instruction.parsed.info;
    return info.mint === PYUSD_MAINNET_MINT.toBase58() &&
      info.source === sourceAta.toBase58() &&
      info.destination === destinationAta.toBase58() &&
      info.authority === args.payer.toBase58() &&
      info.tokenAmount?.amount === args.amountAtomic.toString() &&
      info.tokenAmount?.decimals === PYUSD_DECIMALS;
  });
  if (matches.length !== 1 || transfers.length !== 1) {
    throw new Error("pyusd_transfer_does_not_match_payment_request");
  }

  return {
    verified: true as const,
    status: "finalized" as const,
    network: "solana-mainnet" as const,
    asset: "PYUSD" as const,
    mint: PYUSD_MAINNET_MINT.toBase58(),
    amountAtomic: args.amountAtomic.toString(),
    payer: args.payer.toBase58(),
    recipient: args.recipient.toBase58(),
  };
}

export async function verifyPyusdPayment(rawInput: unknown) {
  const input = VerifyInput.parse(rawInput);
  const amountAtomic = parsePyusdAmount(input.amount);
  const payer = new PublicKey(input.payer);
  const recipient = getTreasuryWallet();
  const signatureBytes = bs58.decode(input.signature);
  if (signatureBytes.length !== 64) throw new Error("invalid_transaction_signature");

  const connection = getMainnetConnection();
  if (await connection.getGenesisHash() !== SOLANA_MAINNET_GENESIS_HASH) {
    throw new PyusdConfigurationError("PYUSD endpoint must use Solana Mainnet");
  }
  const transaction = await connection.getParsedTransaction(input.signature, {
    commitment: "finalized",
    maxSupportedTransactionVersion: 0,
  });
  const result = verifyPyusdParsedTransaction(transaction, {
    payer, recipient, amountAtomic, requestId: input.requestId,
  });
  return {
    ...result,
    requestId: input.requestId,
    amount: input.amount,
    signature: input.signature,
    explorerUrl: `https://explorer.solana.com/tx/${input.signature}`,
  };
}
