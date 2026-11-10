# Hackathon Submission — ChannelSwarm

## Project Name
ChannelSwarm

## Tagline
Autonomous multi-agent economy on Solana with official Payment Channels, PYUSD, and PayPal dual-rail settlement

## Short Description (card / list)
ChannelSwarm is a Solana-native agent economy that combines the live Payment Channels program, 50-byte Ed25519 vouchers, reputation-gated A2A micropayments, Stocknized Agents, and dual-rail settlement (Solana channels + PayPal Orders + official PYUSD).

## Full Description

### Problem
Most AI agents still pay with one on-chain transaction per action. That cannot scale to millions of micropayments. Few agents form a real agent-to-agent economy, and almost none connect payments to both Solana-native rails and traditional payment networks like PayPal.

### Solution
ChannelSwarm combines four capabilities:

1. **Official Payment Channels** — Uses the live Solana Foundation program `CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX`. Agents escrow a ceiling once, sign off-chain vouchers, and settle in a single transaction.

2. **A2A payment economy** — Specialized agents (Alpha, DataOracle, StockHunter) exchange micropayments through channel vouchers. Reputation scores and hard spending ceilings gate participation.

3. **Stocknized Agent** — Tokenized-equity strategy with paper default and opt-in live execution (Backpack RFQ or Jupiter xStock). Execution proofs are generated for both simulated and live fills.

4. **Dual-rail settlement** — Agents can settle via:
   - Solana Payment Channels (USDC or official PYUSD)
   - PayPal Orders v2 sandbox (agent-to-human or cross-rail)
   - Official PYUSD mint on Solana (Token-2022)

### Why this is differentiated
- Live Solana Payment Channels program ID + compatible 50-byte Ed25519 voucher implementation
- Official PYUSD mint support (mainnet + devnet) on Solana
- Working PayPal sandbox Orders client for dual-rail agent settlement
- Reputation-gated multi-agent swarm with persistence
- Stocknized layer with explicit execution modes and proofs

### How to run
```bash
git clone https://github.com/wadezigh96/Channel_Swarm.git
cd Channel_Swarm
npm install
npm run demo

# Optional: PYUSD mode
USE_PYUSD=true npm run demo

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
- **Dual-rail:** Solana Payment Channels + PayPal Orders + PYUSD
- **Demo status:** simulation-first by default; on-chain and PayPal paths are opt-in and functional in sandbox
- **Honesty:** live tokenized-equity fills require credentials + funded accounts; paper mode always works

### Team
Solo
