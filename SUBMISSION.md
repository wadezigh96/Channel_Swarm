# Hackathon Submission — ChannelSwarm

## Project Name
ChannelSwarm

## Tagline
Autonomous multi-agent economy on Solana with Solana Payment Channels, PYUSD mint identification, and a separate PayPal checkout rail

## Short Description (card / list)
ChannelSwarm is a Solana-native agent economy that combines the live Payment Channels program, 50-byte Ed25519 vouchers, reputation-gated A2A micropayments, Stocknized Agents, and selectable payment rails: Solana channels or PayPal Orders v2 checkout.

## Full Description

### Problem
Most AI agents still pay with one on-chain transaction per action. That cannot scale to millions of micropayments. Few agents form a real agent-to-agent economy, and almost none connect payments to both Solana-native rails and traditional payment networks like PayPal.

### Solution
ChannelSwarm combines four capabilities:

1. **Official Payment Channels** — Uses the live Solana Foundation program `CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX`. Agents escrow a ceiling once, sign off-chain vouchers, and settle in a single transaction.

2. **A2A payment economy** — Specialized agents (Alpha, DataOracle, StockHunter) exchange micropayments through channel vouchers. Reputation scores and hard spending ceilings gate participation.

3. **Stocknized Agent** — Tokenized-equity strategy with paper default and opt-in live execution (Backpack RFQ or Jupiter xStock). Execution proofs are generated for both simulated and live fills.

4. **Selectable payment rails** — A payment intent selects either Solana channel settlement or PayPal Orders v2 sandbox checkout. The orchestrator no longer creates a PayPal order after a Solana settlement. PayPal capture is only exposed after the order is verified as APPROVED. PYUSD mint addresses are recognized, but on-chain Token-2022 channel compatibility remains blocked pending independent verification.

### Why this is differentiated
- Live Solana Payment Channels program ID + compatible 50-byte Ed25519 voucher implementation
- Official PYUSD mint address identification; on-chain Token-2022 settlement is not enabled
- PayPal sandbox Orders v2 create/get/capture client with approval check and webhook-signature verification helper
- Reputation-gated multi-agent swarm with persistence
- Stocknized layer with explicit execution modes and proofs

### How to run
```bash
git clone https://github.com/wadezigh96/Channel_Swarm.git
cd Channel_Swarm
npm install
npm run demo

# Optional: PYUSD devnet simulation (default)

# Optional: PayPal sandbox order
# (set PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET in .env)
npx tsx examples/paypal-swarm-demo.ts
```

### Links (paste into form)
- **GitHub:** https://github.com/wadezigh96/Channel_Swarm
- **Live dashboard:** https://swarm-agent-beta.vercel.app/
- **Payment Channels program (Explorer):** https://explorer.solana.com/address/CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX
- **PYUSD on Solana:** https://solana.com/pyusd
- **Demo video:** (add your 60–90s Loom/YouTube link)

### Submission notes
- **Target track:** Best Use of Agentic Commerce / Agentic Payments
- **Payment rails:** choose Solana Payment Channels OR PayPal Orders checkout per intent; PYUSD Token-2022 channel execution remains blocked pending compatibility verification
- **Demo status:** simulation-first by default; PayPal sandbox order creation is available (no automatic capture); webhook receiver and durable reconciliation are not implemented; PYUSD Token-2022 on-chain channel settlement is blocked pending program compatibility verification
- **Honesty:** live tokenized-equity fills require credentials + funded accounts; paper mode always works. Dashboards are static snapshots. No mainnet transaction or deployment is part of this submission

### Team
Solo
