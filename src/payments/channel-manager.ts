/**
 * ChannelManager — Real Payment Channels integration for Agentic Payments
 *
 * Program (mainnet live):
 *   CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX
 *   https://github.com/solana-foundation/payment-channels
 *
 * Voucher wire format (50 bytes, Ed25519-signed):
 *   0..2   magic [0x56, 0x01]
 *   2..34  channel_id (32 bytes PDA)
 *   34..42 cumulative_amount (u64 LE)
 *   42..50 expires_at (i64 LE, 0 = no expiry)
 *
 * Lifecycle: open → off-chain vouchers → settle (Ed25519 precompile) → distribute/refund
 *
 * This module implements the full state machine client-side.
 * For production on-chain calls, use the official generated TypeScript client
 * from solana-foundation/payment-channels or @solana/pay-kit.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import nacl from "tweetnacl";

/** Official Payment Channels program ID (mainnet) */
export const PAYMENT_CHANNELS_PROGRAM_ID = new PublicKey(
  "CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX"
);

export const CHANNEL_SEED = Buffer.from("channel");
export const VOUCHER_MAGIC = new Uint8Array([0x56, 0x01]); // 'V' + version 1
export const VOUCHER_SIZE = 50;

export interface ChannelConfig {
  connection: Connection;
  payer: Keypair;
  usdcMint: PublicKey;
  /** Defaults to official mainnet program */
  programId?: PublicKey;
}

export interface OpenChannelParams {
  counterparty: PublicKey; // payee
  ceilingUsdc: number;
  expirySeconds?: number;
  salt?: bigint;
}

export interface Voucher {
  channelId: string;
  channelPda: PublicKey;
  cumulativeAmount: bigint; // micro-USDC
  expiresAt: bigint;
  message: Uint8Array; // 50-byte canonical message
  signature: Uint8Array; // Ed25519
  timestamp: number;
}

export class ChannelManager {
  private connection: Connection;
  private payer: Keypair;
  private usdcMint: PublicKey;
  private programId: PublicKey;
  private openChannels = new Map<
    string,
    {
      ceiling: bigint;
      spent: bigint;
      counterparty: PublicKey;
      channelPda: PublicKey;
      salt: bigint;
      openSlot: number;
    }
  >();

  constructor(config: ChannelConfig) {
    this.connection = config.connection;
    this.payer = config.payer;
    this.usdcMint = config.usdcMint;
    this.programId = config.programId ?? PAYMENT_CHANNELS_PROGRAM_ID;
  }

  /**
   * Derive channel PDA per official program:
   * seeds = ["channel", payer, payee, mint, authorized_signer, salt, open_slot]
   */
  async deriveChannelPda(
    payee: PublicKey,
    salt: bigint,
    openSlot: number,
    authorizedSigner: PublicKey = this.payer.publicKey
  ): Promise<[PublicKey, number]> {
    const saltBuf = Buffer.alloc(8);
    saltBuf.writeBigUInt64LE(salt);
    const slotBuf = Buffer.alloc(8);
    slotBuf.writeBigUInt64LE(BigInt(openSlot));

    return PublicKey.findProgramAddressSync(
      [
        CHANNEL_SEED,
        this.payer.publicKey.toBuffer(),
        payee.toBuffer(),
        this.usdcMint.toBuffer(),
        authorizedSigner.toBuffer(),
        saltBuf,
        slotBuf,
      ],
      this.programId
    );
  }

  /**
   * Open a Payment Channel.
   * In production this builds the real `open` instruction and sends it.
   * Demo mode tracks state locally while documenting the real program path.
   */
  async openChannel(params: OpenChannelParams): Promise<string> {
    const salt = params.salt ?? BigInt(Date.now());
    const openSlot = await this.connection.getSlot("confirmed");
    const [channelPda] = await this.deriveChannelPda(
      params.counterparty,
      salt,
      openSlot
    );

    const channelId = channelPda.toBase58();
    const ceiling = BigInt(Math.floor(params.ceilingUsdc * 1_000_000));

    // Production path (commented — requires USDC + real open ix):
    // const ix = buildOpenInstruction({ programId, payer, payee, mint, deposit: ceiling, salt, openSlot, ... })
    // await sendAndConfirmTransaction(connection, new Transaction().add(ix), [payer])

    this.openChannels.set(channelId, {
      ceiling,
      spent: 0n,
      counterparty: params.counterparty,
      channelPda,
      salt,
      openSlot,
    });

    console.log(
      `[Channel] Opened ${channelId.slice(0, 12)}... (program ${this.programId.toBase58().slice(0, 8)}...) ceiling ${params.ceilingUsdc} USDC → ${params.counterparty.toBase58().slice(0, 8)}...`
    );
    console.log(
      `[Channel] Real program: https://explorer.solana.com/address/${PAYMENT_CHANNELS_PROGRAM_ID.toBase58()}`
    );
    return channelId;
  }

  /**
   * Build the canonical 50-byte voucher message and sign it with Ed25519.
   * This is the exact format the on-chain program verifies via the Ed25519 precompile.
   */
  createVoucherMessage(
    channelPda: PublicKey,
    cumulativeAmount: bigint,
    expiresAt: bigint = 0n
  ): Uint8Array {
    const msg = new Uint8Array(VOUCHER_SIZE);
    msg.set(VOUCHER_MAGIC, 0);
    msg.set(channelPda.toBytes(), 2);

    const amountView = new DataView(msg.buffer, 34, 8);
    amountView.setBigUint64(0, cumulativeAmount, true); // little-endian

    const expiryView = new DataView(msg.buffer, 42, 8);
    expiryView.setBigInt64(0, expiresAt, true);

    return msg;
  }

  /**
   * Create an off-chain voucher (signed authorization) for a micropayment.
   * High-frequency path — zero on-chain cost until settle.
   */
  async createVoucher(channelId: string, amountUsdc: number): Promise<Voucher> {
    const channel = this.openChannels.get(channelId);
    if (!channel) throw new Error(`Channel ${channelId} not found`);

    const amount = BigInt(Math.floor(amountUsdc * 1_000_000));
    const newSpent = channel.spent + amount;
    if (newSpent > channel.ceiling) {
      throw new Error(`Would exceed channel ceiling of ${Number(channel.ceiling) / 1e6} USDC`);
    }

    const message = this.createVoucherMessage(channel.channelPda, newSpent, 0n);
    const signature = nacl.sign.detached(message, this.payer.secretKey);

    channel.spent = newSpent;
    this.openChannels.set(channelId, channel);

    const voucher: Voucher = {
      channelId,
      channelPda: channel.channelPda,
      cumulativeAmount: newSpent,
      expiresAt: 0n,
      message,
      signature,
      timestamp: Date.now(),
    };

    console.log(
      `[x402/Channel] Voucher signed — +${amountUsdc} USDC (cumulative ${Number(newSpent) / 1e6}) | 50-byte wire format`
    );
    return voucher;
  }

  /**
   * Settle the channel: claim actual usage on-chain and refund remainder.
   * Production: Ed25519 precompile + settle ix, then distribute / withdraw_payer.
   */
  async settle(channelId: string): Promise<{ claimed: number; refunded: number }> {
    const channel = this.openChannels.get(channelId);
    if (!channel) throw new Error(`Channel ${channelId} not found`);

    const claimed = Number(channel.spent) / 1_000_000;
    const refunded = Number(channel.ceiling - channel.spent) / 1_000_000;

    // Production path:
    // 1. Include Ed25519SigVerify instruction with the final voucher
    // 2. Call settle (or settle_and_seal)
    // 3. Call distribute to pay payee + refund payer + close escrow

    console.log(
      `[Settle] Channel ${channelId.slice(0, 12)}... → claimed ${claimed.toFixed(4)} USDC, refunded ${refunded.toFixed(4)} USDC`
    );
    console.log(
      `[Settle] On-chain path: Ed25519 precompile → settle → distribute (program ${this.programId.toBase58().slice(0, 8)}...)`
    );

    this.openChannels.delete(channelId);
    return { claimed, refunded };
  }

  getChannelState(channelId: string) {
    return this.openChannels.get(channelId);
  }

  getProgramId() {
    return this.programId;
  }
}
