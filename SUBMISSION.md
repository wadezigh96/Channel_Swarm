# Hackathon Submission — ChannelSwarm

## Project Name
ChannelSwarm

## Tagline
Autonomous multi-agent economy on Solana with official Payment Channels, PYUSD, and PayPal dual-rail settlement

## Short Description (card / list)
ChannelSwarm is a Solana-native agent-economy prototype with a simulation-first swarm, 50-byte Ed25519 vouchers, reputation-gated A2A micropayments, a paper-first Stocknized Agent, and integration paths for Solana Payment Channels, PYUSD, and PayPal Orders.

## Full Description

### Problem
Most AI agents still pay with one on-chain transaction per action. That cannot scale to millions of micropayments. Few agents form a real agent-to-agent economy, and almost none connect payments to both Solana-native rails and traditional payment networks like PayPal.

### Solution
ChannelSwarm combines these capabilities:

1. **Official Payment Channels** — Builds instructions for the Solana Foundation program `CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX`. The default demo simulates the lifecycle; mainnet submission requires explicit `ONCHAIN=true` and a funded payer. A funded mainnet lifecycle has not been executed.

2. **A2A payment economy** — Specialized agents (Alpha, DataOracle, StockHunter) exchange signed vouchers in the demo. Reputation scores and spending ceilings gate participation.

3. **Stocknized Agent** — Tokenized-equity strategy with paper default and opt-in live execution (Backpack RFQ or Jupiter xStock). Paper proofs are local; live fills need credentials, supported markets, and funded accounts.

4. **PayPal dual-rail path** — Includes Orders v2 sandbox create/lookup/capture, webhook signature verification, partial-refund reconciliation, and an Upstash-backed order ledger with monotonic status updates. Capture requires payer approval. Merchant credentials, a registered webhook, Upstash configuration, and sandbox end-to-end validation are still required.

5. **PYUSD / Token-2022** — Recognizes the official PYUSD mint, derives Token-2022 accounts, and rejects unsupported mint extensions before an on-chain attempt. A funded PYUSD mainnet transaction has not been verified.

### Why this is differentiated
- Solana Payment Channels instruction builder + tested 50-byte Ed25519 voucher implementation
- Token-2022-aware account derivation with fail-closed extension checks
- PayPal sandbox order lifecycle and signed-webhook partial-refund reconciliation with mocked regression tests
- Reputation-gated multi-agent simulation with explicit paper/live stock execution modes
- Stocknized layer with explicit execution modes and proofs

### How to run
```bash
git clone https://github.com/wadezigh96/Channel_Swarm.git
cd Channel_Swarm
npm install
npm test
npm run build
npm run demo

# Optional: choose PYUSD in simulation
USE_PYUSD=true npm run demo

# Optional: create a PayPal sandbox order (requires sandbox credentials)
# (set PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET in .env)
npx tsx examples/paypal-swarm-demo.ts

# Mainnet submission is not part of the default demo.
# Only opt in after reviewing the payer, mint, extensions, and balance.
# ONCHAIN=true npm run demo
```

### Links (paste into form)
- **GitHub:** https://github.com/wadezigh96/Channel_Swarm
- **Live dashboard:** https://swarm-agent-beta.vercel.app/
- **Payment Channels program (Explorer):** https://explorer.solana.com/address/CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX
- **PYUSD on Solana:** https://solana.com/pyusd
- **Demo video:** (add your 60–90s Loom/YouTube link)

### Submission notes
- **Target track:** Best Use of Agentic Commerce / Agentic Payments
- **Dual-rail:** Solana Payment Channels + PayPal Orders + PYUSD
- **Demo status:** simulation-only by default. Mainnet, PayPal sandbox, and live stock execution require explicit configuration.
- **Integration status:** PayPal API logic and webhook verification have mocked tests; sandbox credentials, webhook, and Upstash have not been used for an end-to-end run. Mainnet and funded PYUSD lifecycle have not been executed.
- **Advisor:** deterministic rail recommendations work without a model. Optional AI Gateway mode requires a server-side key and a provider/model test.
- **Deployment:** changes made after this draft need to be pushed and deployed before the public dashboard reflects them.

### Team
Solo
