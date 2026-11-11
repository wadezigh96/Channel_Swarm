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

4. **Selectable payment rails + AI** — An AI Gateway advisor can recommend Solana channels or PayPal checkout based on the task and available rails. Its output is validated and advisory only; it cannot execute a payment. PayPal Orders v2 is backed by a verified webhook endpoint and durable KV ledger. Live capture remains separately locked and is never triggered by webhooks. PYUSD is identified but rejected for channel use when unsupported Token-2022 extensions are present.

### Why this is differentiated
- Live Solana Payment Channels program ID + compatible 50-byte Ed25519 voucher implementation
- Official PYUSD mint address identification; on-chain Token-2022 settlement is not enabled
- PayPal Orders v2 client, signature-verified webhook endpoint, durable KV ledger and independent Live capture gate (requires credentials and end-to-end validation)
- AI Gateway payment-rail recommender with a strict human-approval boundary
- Reputation-gated multi-agent swarm plus durable PayPal order/event ledger (Vercel KV / Upstash credentials required)
- Stocknized layer with explicit execution modes and proofs

### How to run
```bash
git clone https://github.com/wadezigh96/Channel_Swarm.git
cd Channel_Swarm
npm install
npm run demo

# Default demo uses devnet USDC simulation; PYUSD is a separate, gated direct-payment rail

# Optional: PayPal sandbox order
# (set PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET in .env)
npx tsx examples/paypal-swarm-demo.ts
```

### Links (paste into form)
- **GitHub:** https://github.com/wadezigh96/Channel_Swarm
- **Existing dashboard (unchanged main-branch deployment):** https://swarm-agent-beta.vercel.app/
- **Payment Channels program (Explorer):** https://explorer.solana.com/address/CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX
- **PYUSD on Solana:** https://solana.com/pyusd
- **Demo video:** (add your 60–90s Loom/YouTube link)

### Submission notes
- **Target track:** Best Use of Agentic Commerce / Agentic Payments
- **Payment rails:** choose Solana Payment Channels OR PayPal Orders checkout per intent; PYUSD Token-2022 channel execution remains blocked pending compatibility verification
- **Demo status:** devnet USDC simulation-first by default; Mainnet transaction gates are independent and disabled; PayPal create/return/capture/webhook routes and durable KV ledger are implemented but require PayPal webhook registration and KV credentials; AI rail advice requires an AI Gateway key or configured Vercel OIDC; PYUSD with unsupported Token-2022 extensions is rejected; dashboard health checks are not payment telemetry; x402 replay protection uses atomic KV storage and fails closed on Vercel without KV
- **Honesty:** live tokenized-equity fills require credentials + funded accounts; paper mode always works. Dashboard metrics remain static demo snapshots with separate RPC/configuration health checks. No Mainnet transaction, real PayPal capture or Production deployment is part of this preparation

### Team
Solo
