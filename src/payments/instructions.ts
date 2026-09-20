/**
 * Hand-built instructions for solana-foundation/payment-channels
 * Program ID: CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX
 *
 * Discriminators from ADR-003:
 *   1 open | 2 settle | 3 topUp | 4 settleAndSeal | 5 requestClose | 6 seal | 7 distribute
 */

import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  Ed25519Program,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { PAYMENT_CHANNELS_PROGRAM_ID } from "./channel-manager.js";

export const EVENT_AUTHORITY_SEED = Buffer.from("__event_authority");

export function eventAuthorityPda(
  programId: PublicKey = PAYMENT_CHANNELS_PROGRAM_ID
): PublicKey {
  return PublicKey.findProgramAddressSync([EVENT_AUTHORITY_SEED], programId)[0];
}

export interface OpenIxParams {
  payer: PublicKey;
  rentPayer: PublicKey;
  payee: PublicKey;
  mint: PublicKey;
  authorizedSigner: PublicKey;
  channel: PublicKey;
  salt: bigint;
  deposit: bigint;
  gracePeriod: number;
  openSlot: bigint;
  recipients?: { recipient: PublicKey; bps: number }[];
  programId?: PublicKey;
  tokenProgram?: PublicKey;
}

export function buildOpenInstruction(p: OpenIxParams): TransactionInstruction {
  const programId = p.programId ?? PAYMENT_CHANNELS_PROGRAM_ID;
  const tokenProgram = p.tokenProgram ?? TOKEN_PROGRAM_ID;
  const recipients = p.recipients ?? [];

  const data = encodeOpenData({
    salt: p.salt,
    deposit: p.deposit,
    gracePeriod: p.gracePeriod,
    openSlot: p.openSlot,
    recipients,
  });

  const payerAta = getAssociatedTokenAddressSync(p.mint, p.payer, false, tokenProgram);
  const channelAta = getAssociatedTokenAddressSync(p.mint, p.channel, true, tokenProgram);

  const keys = [
    { pubkey: p.payer, isSigner: true, isWritable: true },
    { pubkey: p.rentPayer, isSigner: true, isWritable: true },
    { pubkey: p.payee, isSigner: false, isWritable: false },
    { pubkey: p.mint, isSigner: false, isWritable: false },
    { pubkey: p.authorizedSigner, isSigner: false, isWritable: false },
    { pubkey: p.channel, isSigner: false, isWritable: true },
    { pubkey: payerAta, isSigner: false, isWritable: true },
    { pubkey: channelAta, isSigner: false, isWritable: true },
    { pubkey: tokenProgram, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: eventAuthorityPda(programId), isSigner: false, isWritable: false },
    { pubkey: programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({ programId, keys, data });
}

export function encodeOpenData(args: {
  salt: bigint;
  deposit: bigint;
  gracePeriod: number;
  openSlot: bigint;
  recipients: { recipient: PublicKey; bps: number }[];
}): Buffer {
  const recs = args.recipients;
  const buf = Buffer.alloc(1 + 8 + 8 + 4 + 8 + 4 + recs.length * 34);
  let o = 0;
  buf.writeUInt8(1, o);
  o += 1; // discriminator: open
  buf.writeBigUInt64LE(args.salt, o);
  o += 8;
  buf.writeBigUInt64LE(args.deposit, o);
  o += 8;
  buf.writeUInt32LE(args.gracePeriod, o);
  o += 4;
  buf.writeBigUInt64LE(args.openSlot, o);
  o += 8;
  buf.writeUInt32LE(recs.length, o);
  o += 4;
  for (const r of recs) {
    r.recipient.toBuffer().copy(buf, o);
    o += 32;
    buf.writeUInt16LE(r.bps, o);
    o += 2;
  }
  return buf;
}

export function buildSettleInstruction(
  channel: PublicKey,
  programId: PublicKey = PAYMENT_CHANNELS_PROGRAM_ID
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: channel, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([2]),
  });
}

export function buildSettleAndSealInstruction(
  payee: PublicKey,
  channel: PublicKey,
  hasVoucher: boolean,
  programId: PublicKey = PAYMENT_CHANNELS_PROGRAM_ID
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: payee, isSigner: true, isWritable: false },
      { pubkey: channel, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([4, hasVoucher ? 1 : 0]),
  });
}

export function buildRequestCloseInstruction(
  payer: PublicKey,
  channel: PublicKey,
  programId: PublicKey = PAYMENT_CHANNELS_PROGRAM_ID
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: false },
      { pubkey: channel, isSigner: false, isWritable: true },
    ],
    data: Buffer.from([5]),
  });
}

export function buildEd25519VoucherIx(
  signerPubkey: PublicKey,
  message: Uint8Array,
  signature: Uint8Array
): TransactionInstruction {
  return Ed25519Program.createInstructionWithPublicKey({
    publicKey: signerPubkey.toBytes(),
    message,
    signature,
  });
}
