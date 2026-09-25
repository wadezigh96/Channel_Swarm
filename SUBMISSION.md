# Hackathon Submission — ChannelSwarm

## Project Name
ChannelSwarm

## Tagline
Autonomous multi-agent economy on Solana using official Payment Channels + A2A micropayments + Stocknized Agents

## Short Description (card / list)
ChannelSwarm is a multi-agent Solana prototype that integrates the live Payment Channels program interface, runs agent-to-agent micropayments with canonical 50-byte Ed25519 vouchers in simulation mode, and includes a Stocknized Agent paper-trading layer to demonstrate how an RWA-style strategy could feed payment capacity.

## Full Description

### Problem
Most AI agents still pay with one on-chain transaction per action. That cannot scale to millions of micropayments. Few agents form a real agent-to-agent economy, and almost none connect payments to tokenized equities (RWA).

### Solution
ChannelSwarm combines three rare capabilities:

1. **Official Payment Channels** — Uses the live Solana Foundation program `CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX`. Agents escrow a ceiling once, sign off-chain vouchers, and settle in a single transaction (the 1M+ payments/sec primitive).

2. **A2A payment economy** — Specialized agents (General, Data Oracle, Stock Hunter) exchange simulated micropayments through channel vouchers. Reputation scores and hard spending ceilings provide the gating model.

3. **Stocknized Agent** — Uses deterministic paper-trading quotes and an in-memory portfolio to demonstrate a possible funding loop between an RWA strategy and agentic payments. Real tokenized-equity settlement is not currently wired.

### Why this is differentiated
- Live Solana Payment Channels program ID and compatible instruction/voucher implementation
- Canonical 50-byte voucher wire format + Ed25519 signing
- Simulated agent-to-agent payment economy with reputation and spending ceilings
- Stocknized paper-trading layer illustrating an RWA-to-payments funding concept

### How to run
```bash
git clone https://github.com/wadezigh96/Channel_Swarm.git
cd Channel_Swarm
npm install && npm run demo
```

### Links (paste into form)
- **GitHub:** https://github.com/wadezigh96/Channel_Swarm
- **Live dashboard:** https://swarm-agent-beta.vercel.app/
- **Payment Channels program (Explorer):** https://explorer.solana.com/address/CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX
- **Demo video:** (add your 60–90s Loom/YouTube link)

### Submission notes
- **Stocklana Main:** primary track.
- **Stocknized Agent:** paper-first Stocknized Agent flow with explicit execution modes and proofs.
- **Agentic Payments:** Payment Channels + A2A voucher flow is included where applicable.
- **Demo status:** simulation-first; paper stock data is clearly labeled and live tokenized-equity settlement is not claimed unless an execution proof is returned.

### Team
Solo
