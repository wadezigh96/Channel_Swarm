# Swarm Agent

> **The rarest Agentic Payments project on Solana.**  
> Autonomous multi-agent swarm that opens **Payment Channels**, settles **x402** micropayments at extreme scale, and runs **Stocknized Agents** that trade tokenized equities — all without a human in the loop.

Built specifically to win the **Agentic Payments** track and the **Stocknized Agent on Clawpump** bounty on [hackathons.solana.com](https://hackathons.solana.com/).

---

## Why this is rare (and why it can win)

Most "AI agents on Solana" are just trading bots or chat wrappers.

**ChannelSwarm is different:**

1. **True Payment Channels** — Not one-tx-per-payment. Agents open a channel once, sign off-chain vouchers at <10ms, and settle thousands of payments in a single on-chain transaction. This is the primitive Solana just made live for 1M+ payments per second.
2. **Agent-to-Agent (A2A) economy** — Agents buy compute, data, stock analysis, and inference *from each other* using channels. No human approval.
3. **Stocknized Agent** — Specialized agent that launches / trades tokenized stocks with Meteora DBC + Clawpump-style liquidity, then uses earned yield to fund its own Payment Channels.
4. **Spending controls + reputation** — Every agent has hard daily/per-call limits and an on-chain reputation score that other agents check before opening a channel.
5. **Self-funding loop** — Agents can launch their own tokens or earn from stock trading fees and recycle profits into more channel capacity.

This combination (Payment Channels + A2A marketplace + Stocknized RWA agent) does not exist in any other public submission.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ChannelSwarm Runtime                      │
├──────────────┬──────────────────────┬───────────────────────┤
│  Core Agent  │  Payment Channel Mgr │  Stocknized Agent     │
│  (LLM loop)  │  (x402 + channels)   │  (Meteora / Clawpump) │
├──────────────┴──────────────────────┴───────────────────────┤
│                 On-chain Reputation + Escrow                 │
└─────────────────────────────────────────────────────────────┘
```

### Key flows

1. **Open Channel**  
   Agent A deposits USDC ceiling → creates Payment Channel PDA with Agent B.

2. **High-frequency spend**  
   Agent A signs vouchers off-chain for every API call / data request. Zero gas until settle.

3. **Settle**  
   One transaction claims the actual usage and refunds the rest.

4. **Stock loop**  
   Stocknized Agent analyzes tokenized equities → trades via Meteora DBC or Clawpump → profits fund new channels.

---

## Quick Start

```bash
git clone https://github.com/wadezigh96/ChannelSwarm-Agent.git
cd ChannelSwarm-Agent
npm install

# Set your keys (never commit real keys)
cp .env.example .env
# edit .env with SOLANA_PRIVATE_KEY, RPC_URL, etc.

# Run the demo swarm
npm run demo
```

### Demo output (example)
```
[Swarm] 3 agents online
[Channel] Agent-Alpha opened channel with Agent-Data (ceiling: 5 USDC)
[x402] Agent-Alpha paid 0.001 USDC for stock quote (voucher #47)
[Stock] Agent-Stocknized bought synthetic AAPL via Meteora DBC
[Settle] Channel closed — 0.047 USDC claimed, 4.953 USDC refunded
[Reputation] Agent-Data score +0.12
```

---

## Project Structure

```
ChannelSwarm-Agent/
├── src/
│   ├── core/           # Agent runtime + LLM loop
│   ├── payments/       # Payment Channels + x402 client
│   ├── stock/          # Stocknized Agent (tokenized equities)
│   ├── reputation/     # On-chain reputation helpers
│   └── swarm/          # Multi-agent orchestration
├── programs/           # (optional) custom Anchor programs
├── examples/           # Ready-to-run demos
├── .env.example
├── package.json
└── README.md
```

---

## Tech Stack

- **Solana** — `@solana/web3.js`, `@solana/spl-token`
- **Payment Channels** — Official `solana-foundation/payment-channels` primitive
- **x402** — HTTP 402 micropayments (facilitator + direct)
- **Meteora DBC** — Dynamic Bonding Curve for stock-token launches
- **TypeScript** — Full type safety
- **Optional LLM** — OpenAI / Anthropic / local models for agent reasoning

---

## Bounties Targeted

| Track | Why ChannelSwarm fits |
|-------|-----------------------|
| **Agentic Payments** | Native Payment Channels + x402 A2A economy |
| **Stocknized Agent on Clawpump** | Dedicated agent that launches & trades tokenized stocks |
| **Main Stocklana** | End-to-end stock agent that actually earns and reinvests |

---

## Roadmap (post-hackathon)

- [ ] Mainnet deployment of reputation program
- [ ] Public agent marketplace UI
- [ ] Integration with Alibaba Cloud / other x402-enabled compute providers
- [ ] Multi-hop channel routing (agent pays another agent that pays a third)
- [ ] Seeker mobile app for monitoring your swarm

---

## License

MIT — build on it, fork it, make agents richer.

---

**Built for Solana Hackathons 2026**  
*Agents that pay. Agents that earn. Agents that compound.*
