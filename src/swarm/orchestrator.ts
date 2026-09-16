/**
 * Swarm Orchestrator — Runs multiple specialized agents that pay each other
 * via Payment Channels and fund themselves with Stocknized trading.
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { ChannelManager } from "../payments/channel-manager.js";
import { StocknizedAgent } from "../stock/stocknized-agent.js";

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

  constructor(connection: Connection, usdcMint: PublicKey) {
    this.connection = connection;
    this.usdcMint = usdcMint;
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

    const cm = new ChannelManager({
      connection: this.connection,
      payer: kp,
      usdcMint: this.usdcMint,
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

  /**
   * Core demo loop shown to judges:
   * open channel → high-frequency vouchers → stock trade → settle → reputation
   */
  async runDemoCycle() {
    if (this.agents.length < 2) throw new Error("Need at least 2 agents");

    const alpha = this.agents.find((a) => a.role === "general") ?? this.agents[0];
    const dataAgent = this.agents.find((a) => a.role === "data") ?? this.agents[1];
    const cmAlpha = this.channelManagers.get(alpha.name)!;

    // 1. Open Payment Channel
    const channelId = await cmAlpha.openChannel({
      counterparty: dataAgent.keypair.publicKey,
      ceilingUsdc: 5.0,
    });

    // 2. High-frequency micropayments (simulate 20 data/API requests)
    console.log(`[x402] Starting high-frequency voucher stream...`);
    for (let i = 1; i <= 20; i++) {
      await cmAlpha.createVoucher(channelId, 0.002); // $0.002 per call
    }

    // 3. Stocknized Agent runs its strategy
    if (this.stockAgent) {
      console.log(`[Stock] Stocknized Agent executing strategy...`);
      await this.stockAgent.runStrategy();
    }

    // 4. Settle the channel (one on-chain tx in production)
    const { claimed, refunded } = await cmAlpha.settle(channelId);

    // 5. Local reputation bump (full registry is in demo)
    dataAgent.reputation += 0.05;
    alpha.reputation += 0.02;

    console.log(
      `[Reputation] ${dataAgent.name}: ${dataAgent.reputation.toFixed(2)} | ${alpha.name}: ${alpha.reputation.toFixed(2)}`
    );
    console.log(`[Swarm] Cycle complete — ${claimed.toFixed(4)} USDC flowed between agents`);

    return { claimed, refunded };
  }

  listAgents() {
    return this.agents.map((a) => ({
      name: a.name,
      role: a.role,
      pubkey: a.keypair.publicKey.toBase58(),
      reputation: a.reputation,
    }));
  }
}
