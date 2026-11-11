/**
 * Swarm Orchestrator — specialized agents pay each other via Payment Channels.
 * Optional dual-rail: after Solana channel settle, create a PayPal sandbox order.
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { ChannelManager } from "../payments/channel-manager.js";
import { StocknizedAgent } from "../stock/stocknized-agent.js";
import { ReputationRegistry } from "../reputation/reputation.js";
import { PayPalClient } from "../paypal/paypal-client.js";

export interface AgentIdentity {
  name: string;
  keypair: Keypair;
  role: "data" | "compute" | "stock" | "general";
  reputation: number;
}

export class SwarmOrchestrator {
  private connection: Connection;
  private agents: AgentIdentity[] = [];
  private channelManagers = new Map<string, ChannelManager>();
  private stockAgent: StocknizedAgent | null = null;
  private usdcMint: PublicKey;
  private onchain: boolean;
  private paypal: PayPalClient;

  private reputation = new ReputationRegistry();

  constructor(connection: Connection, usdcMint: PublicKey, onchain = false) {
    this.connection = connection;
    this.usdcMint = usdcMint;
    this.onchain = onchain;
    this.paypal = new PayPalClient();
  }

  getReputation(): ReputationRegistry {
    return this.reputation;
  }

  addAgent(name: string, role: AgentIdentity["role"], keypair?: Keypair) {
    const kp = keypair ?? Keypair.generate();
    const agent: AgentIdentity = {
      name,
      keypair: kp,
      role,
      reputation: 1.0,
    };
    this.agents.push(agent);
    this.reputation.register(name);

    const cm = new ChannelManager({
      connection: this.connection,
      payer: kp,
      usdcMint: this.usdcMint,
      onchain: this.onchain && role === "general",
    });
    this.channelManagers.set(name, cm);

    if (role === "stock") {
      this.stockAgent = new StocknizedAgent(this.connection, kp);
    }

    console.log(
      `[Swarm] Agent ${name} (${role}) online — ${kp.publicKey.toBase58().slice(0, 8)}...`
    );
    return agent;
  }

  async runDemoCycle(voucherCount = 20, perVoucherUsdc = 0.002) {
    if (this.agents.length < 2) throw new Error("Need at least 2 agents");

    const alpha = this.agents.find((a) => a.role === "general") ?? this.agents[0];
    const dataAgent = this.agents.find((a) => a.role === "data") ?? this.agents[1];
    const cmAlpha = this.channelManagers.get(alpha.name)!;

    if (!this.reputation.canOpenChannel(dataAgent.name, 0.5)) {
      throw new Error(
        `Reputation too low to open channel with ${dataAgent.name} (min 0.5)`,
      );
    }

    const channelId = await cmAlpha.openChannel({
      counterparty: dataAgent.keypair.publicKey,
      ceilingUsdc: 5.0,
    });

    console.log(`[x402] Starting high-frequency voucher stream (${voucherCount})...`);
    for (let i = 1; i <= voucherCount; i++) {
      await cmAlpha.createVoucher(channelId, perVoucherUsdc);
    }

    if (this.stockAgent) {
      console.log(`[Stock] Stocknized Agent executing strategy...`);
      await this.stockAgent.runStrategy();
    }

    const { claimed, refunded, signature } = await cmAlpha.settle(channelId);

    const dataScore = this.reputation.recordSuccess(dataAgent.name, claimed);
    const alphaScore = this.reputation.recordSuccess(alpha.name, claimed * 0.4);
    dataAgent.reputation = dataScore;
    alpha.reputation = alphaScore;

    console.log(
      `[Reputation] ${dataAgent.name}: ${dataScore.toFixed(2)} | ${alpha.name}: ${alphaScore.toFixed(2)}`
    );
    console.log(`[Swarm] Cycle complete — ${claimed.toFixed(4)} USDC flowed between agents`);
    if (signature) console.log(`[Swarm] Settle signature: ${signature}`);

    // Creating an external PayPal order is a separate explicit opt-in.
    let paypalOrderId: string | undefined;
    let paypalApproveUrl: string | undefined;
    if (this.paypal.isConfigured() && process.env.PAYPAL_AUTO_ORDER === "true" && claimed > 0) {
      try {
        const order = await this.paypal.createOrder(
          claimed,
          `ChannelSwarm settlement: ${alpha.name} → ${dataAgent.name}`
        );
        paypalOrderId = order.id;
        paypalApproveUrl = order.approveUrl;
        console.log(`[Dual-rail] PayPal order created for ${claimed.toFixed(4)} USD`);
      } catch (err) {
        console.warn("[Dual-rail] PayPal order failed:", err);
      }
    } else if (this.paypal.isConfigured()) {
      console.log("[Dual-rail] Automatic PayPal order disabled — set PAYPAL_AUTO_ORDER=true to opt in");
    } else {
      console.log("[Dual-rail] PayPal not configured — Solana channel only");
    }

    return {
      claimed,
      refunded,
      signature,
      channelId,
      paypalOrderId,
      paypalApproveUrl,
    };
  }

  listAgents() {
    return this.agents.map((a) => ({
      name: a.name,
      role: a.role,
      pubkey: a.keypair.publicKey.toBase58(),
      reputation: this.reputation.get(a.name)?.score ?? a.reputation,
    }));
  }
}
