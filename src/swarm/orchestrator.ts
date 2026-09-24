/**
 * Swarm Orchestrator — specialized agents pay each other via Payment Channels.
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { ChannelManager } from "../payments/channel-manager.js";
import { StocknizedAgent } from "../stock/stocknized-agent.js";
import { ReputationRegistry } from "../reputation/reputation.js";

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

  private reputation = new ReputationRegistry();

  constructor(connection: Connection, usdcMint: PublicKey, onchain = false) {
    this.connection = connection;
    this.usdcMint = usdcMint;
    this.onchain = onchain;
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

    return { claimed, refunded, signature, channelId };
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
