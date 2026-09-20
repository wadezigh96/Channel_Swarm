/**
 * ChannelManager — Official Payment Channels client wrapper
 *
 * Program (mainnet live):
 *   CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX
 *
 * Modes:
 *   sim     — local state machine + signed 50-byte vouchers (default)
 *   onchain — builds + sends real open / settle txs when funded
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import nacl from "tweetnacl";
import {
  buildOpenInstruction,
  buildSettleInstruction,
  buildSettleAndSealInstruction,
  buildEd25519VoucherIx,
  buildRequestCloseInstruction,
} from "./instructions.js";

export const PAYMENT_CHANNELS_PROGRAM_ID = new PublicKey(
  "CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX"
);

export const CHANNEL_SEED = Buffer.from("channel");
export const VOUCHER_MAGIC = new Uint8Array([0x56, 0x01]);
export const VOUCHER_SIZE = 50;
export const DEFAULT_GRACE_PERIOD = 900;

export interface ChannelConfig {
  connection: Connection;
  payer: Keypair;
  usdcMint: PublicKey;
  programId?: PublicKey;
  onchain?: boolean;
}

export interface OpenChannelParams {
  counterparty: PublicKey;
  ceilingUsdc: number;
  expirySeconds?: number;
  salt?: bigint;
  gracePeriod?: number;
}

export interface Voucher {
  channelId: string;
  channelPda: PublicKey;
  cumulativeAmount: bigint;
  expiresAt: bigint;
  message: Uint8Array;
  signature: Uint8Array;
  timestamp: number;
}

export interface OpenedChannel {
  ceiling: bigint;
  spent: bigint;
  counterparty: PublicKey;
  channelPda: PublicKey;
  salt: bigint;
  openSlot: number;
  lastVoucher?: Voucher;
  signature?: string;
  mode: "sim" | "onchain";
}

export class ChannelManager {
  private connection: Connection;
  private payer: Keypair;
  private usdcMint: PublicKey;
  private programId: PublicKey;
  private onchain: boolean;
  private openChannels = new Map<string, OpenedChannel>();

  constructor(config: ChannelConfig) {
    this.connection = config.connection;
    this.payer = config.payer;
    this.usdcMint = config.usdcMint;
    this.programId = config.programId ?? PAYMENT_CHANNELS_PROGRAM_ID;
    this.onchain = Boolean(config.onchain);
  }

  deriveChannelPda(
    payee: PublicKey,
    salt: bigint,
    openSlot: number,
    authorizedSigner: PublicKey = this.payer.publicKey
  ): [PublicKey, number] {
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

  async openChannel(params: OpenChannelParams): Promise<string> {
    const salt = params.salt ?? BigInt(Date.now());
    const openSlot = await this.connection.getSlot("confirmed");
    const [channelPda] = this.deriveChannelPda(params.counterparty, salt, openSlot);
    const channelId = channelPda.toBase58();
    const ceiling = BigInt(Math.floor(params.ceilingUsdc * 1_000_000));

    let signature: string | undefined;
    let mode: "sim" | "onchain" = "sim";

    if (this.onchain) {
      const funded = await this.hasUsdc(ceiling);
      if (!funded.ok) {
        console.warn(`[Channel] ONCHAIN requested but ${funded.reason} — falling back to sim`);
      } else {
        const ix = buildOpenInstruction({
          payer: this.payer.publicKey,
          rentPayer: this.payer.publicKey,
          payee: params.counterparty,
          mint: this.usdcMint,
          authorizedSigner: this.payer.publicKey,
          channel: channelPda,
          salt,
          deposit: ceiling,
          gracePeriod: params.gracePeriod ?? DEFAULT_GRACE_PERIOD,
          openSlot: BigInt(openSlot),
          recipients: [],
          programId: this.programId,
        });
        const tx = new Transaction().add(ix);
        signature = await sendAndConfirmTransaction(this.connection, tx, [this.payer], {
          commitment: "confirmed",
        });
        mode = "onchain";
        console.log(`[Channel] On-chain open tx: ${signature}`);
      }
    }

    this.openChannels.set(channelId, {
      ceiling,
      spent: 0n,
      counterparty: params.counterparty,
      channelPda,
      salt,
      openSlot,
      signature,
      mode,
    });

    console.log(
      `[Channel] Opened ${channelId.slice(0, 12)}... mode=${mode} ceiling ${params.ceilingUsdc} USDC → ${params.counterparty.toBase58().slice(0, 8)}...`
    );
    console.log(
      `[Channel] Program: https://explorer.solana.com/address/${this.programId.toBase58()}`
    );
    return channelId;
  }

  createVoucherMessage(
    channelPda: PublicKey,
    cumulativeAmount: bigint,
    expiresAt: bigint = 0n
  ): Uint8Array {
    const msg = new Uint8Array(VOUCHER_SIZE);
    msg.set(VOUCHER_MAGIC, 0);
    msg.set(channelPda.toBytes(), 2);
    const amountView = new DataView(msg.buffer, 34, 8);
    amountView.setBigUint64(0, cumulativeAmount, true);
    const expiryView = new DataView(msg.buffer, 42, 8);
    expiryView.setBigInt64(0, expiresAt, true);
    return msg;
  }

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
    const voucher: Voucher = {
      channelId,
      channelPda: channel.channelPda,
      cumulativeAmount: newSpent,
      expiresAt: 0n,
      message,
      signature,
      timestamp: Date.now(),
    };
    channel.lastVoucher = voucher;
    this.openChannels.set(channelId, channel);

    console.log(
      `[x402/Channel] Voucher signed — +${amountUsdc} USDC (cumulative ${Number(newSpent) / 1e6}) | 50-byte wire`
    );
    return voucher;
  }

  async settle(channelId: string): Promise<{ claimed: number; refunded: number; signature?: string }> {
    const channel = this.openChannels.get(channelId);
    if (!channel) throw new Error(`Channel ${channelId} not found`);

    const claimed = Number(channel.spent) / 1_000_000;
    const refunded = Number(channel.ceiling - channel.spent) / 1_000_000;
    let signature: string | undefined;

    if (this.onchain && channel.mode === "onchain" && channel.lastVoucher) {
      const ed = buildEd25519VoucherIx(
        this.payer.publicKey,
        channel.lastVoucher.message,
        channel.lastVoucher.signature
      );
      const settleIx = buildSettleInstruction(channel.channelPda, this.programId);
      const tx = new Transaction().add(ed, settleIx);
      signature = await sendAndConfirmTransaction(this.connection, tx, [this.payer], {
        commitment: "confirmed",
      });
      console.log(`[Settle] On-chain settle tx: ${signature}`);
    } else {
      console.log(
        `[Settle] ${channel.mode} path — claimed ${claimed.toFixed(4)} USDC, refunded ${refunded.toFixed(4)} USDC`
      );
    }

    this.openChannels.delete(channelId);
    return { claimed, refunded, signature };
  }

  async settleAndSeal(channelId: string): Promise<{ claimed: number; refunded: number; signature?: string }> {
    const channel = this.openChannels.get(channelId);
    if (!channel) throw new Error(`Channel ${channelId} not found`);

    const claimed = Number(channel.spent) / 1_000_000;
    const refunded = Number(channel.ceiling - channel.spent) / 1_000_000;
    let signature: string | undefined;

    if (this.onchain && channel.mode === "onchain") {
      const voucher = channel.lastVoucher;
      const ed = voucher
        ? buildEd25519VoucherIx(this.payer.publicKey, voucher.message, voucher.signature)
        : undefined;
      const settleAndSealIx = buildSettleAndSealInstruction(
        this.payer.publicKey,
        channel.channelPda,
        Boolean(voucher),
        this.programId
      );
      const tx = new Transaction();
      if (ed) tx.add(ed);
      tx.add(settleAndSealIx);
      signature = await sendAndConfirmTransaction(this.connection, tx, [this.payer], {
        commitment: "confirmed",
      });
      console.log(`[SettleAndSeal] On-chain tx: ${signature}`);
    } else {
      console.log(
        `[SettleAndSeal] ${channel.mode} path — claimed ${claimed.toFixed(4)} USDC, refunded ${refunded.toFixed(4)} USDC`
      );
    }

    this.openChannels.delete(channelId);
    return { claimed, refunded, signature };
  }

  async requestClose(channelId: string): Promise<string | undefined> {
    const channel = this.openChannels.get(channelId);
    if (!channel) throw new Error(`Channel ${channelId} not found`);
    if (!(this.onchain && channel.mode === "onchain")) return undefined;

    const ix = buildRequestCloseInstruction(
      this.payer.publicKey,
      channel.channelPda,
      this.programId
    );
    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(this.connection, tx, [this.payer], {
      commitment: "confirmed",
    });
  }

  private async hasUsdc(needed: bigint): Promise<{ ok: boolean; reason?: string }> {
    try {
      const ata = getAssociatedTokenAddressSync(this.usdcMint, this.payer.publicKey);
      const acc = await getAccount(this.connection, ata);
      if (acc.amount < needed) {
        return {
          ok: false,
          reason: `USDC ATA has ${Number(acc.amount) / 1e6}, need ${Number(needed) / 1e6}`,
        };
      }
      const sol = await this.connection.getBalance(this.payer.publicKey);
      if (sol < 50_000) {
        return { ok: false, reason: `payer has only ${sol} lamports for fees` };
      }
      return { ok: true };
    } catch {
      return { ok: false, reason: "payer USDC ATA missing" };
    }
  }

  getChannelState(channelId: string) {
    return this.openChannels.get(channelId);
  }

  getProgramId() {
    return this.programId;
  }

  isOnchain() {
    return this.onchain;
  }
}
