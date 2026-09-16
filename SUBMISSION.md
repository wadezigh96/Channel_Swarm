# Hackathon Submission — ChannelSwarm

## Project Name
ChannelSwarm

## Tagline
Autonomous multi-agent economy on Solana using official Payment Channels + A2A micropayments + Stocknized Agents

## Short Description (card / list)
ChannelSwarm is a multi-agent swarm that opens real Solana Payment Channels, runs high-frequency agent-to-agent micropayments with canonical 50-byte Ed25519 vouchers, and includes a Stocknized Agent that trades tokenized equities — recycling profits into more channel capacity.

## Full Description

### Problem
Most AI agents still pay with one on-chain transaction per action. That cannot scale to millions of micropayments. Few agents form a real agent-to-agent economy, and almost none connect payments to tokenized equities (RWA).

### Solution
ChannelSwarm combines three rare capabilities:

1. **Official Payment Channels** — Uses the live Solana Foundation program `CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX`. Agents escrow a ceiling once, sign off-chain vouchers, and settle in a single transaction (the 1M+ payments/sec primitive).

2. **A2A marketplace** — Specialized agents (General, Data Oracle, Stock Hunter) pay each other autonomously via channels. Reputation scores gate channel opens; hard spending ceilings prevent runaway spend.

3. **Stocknized Agent** — Trades tokenized equities and recycles profits into new Payment Channel capacity — a self-funding loop between RWA and agentic payments.

### Why this is differentiated
- Real mainnet Payment Channels program ID (not a mock)
- Canonical 50-byte voucher wire format + Ed25519 signing
- Agent-to-agent economy with reputation
- Stocknized / RWA agent funding the payment layer

### How to run
```bash
git clone https://github.com/wadezigh96/Swarm_Agent.git
cd Swarm_Agent
npm install && npm run demo
```

### Links (paste into form)
- **GitHub:** https://github.com/wadezigh96/Swarm_Agent
- **Live dashboard:** https://wadezigh96.github.io/Swarm_Agent/index.html
- **Payment Channels program (Explorer):** https://explorer.solana.com/address/CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX
- **Demo video:** (add your 60–90s Loom/YouTube link)

### Tracks to select
1. **Stocklana Main** (primary — deadline ~18 Sep 2026, 4pm ET)
2. **Stocknized Agent / Clawpump-related bounty** (if listed)
3. Register interest for **Agentic Payments** when the track goes live

### Team
Solo
