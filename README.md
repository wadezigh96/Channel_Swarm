# ⚡ ChannelSwarm

> **Autonomous Agent Economy on Solana**

<div align="center">

**Agents that can earn · spend · coordinate · settle**

[![Solana](https://img.shields.io/badge/Solana-Mainnet-9945FF?style=for-the-badge&logo=solana&logoColor=white)](https://solana.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![CI](https://img.shields.io/github/actions/workflow/status/wadezigh96/Swarm_Agent/ci.yml?branch=main&style=for-the-badge&label=CI)](https://github.com/wadezigh96/Swarm_Agent/actions)
[![License](https://img.shields.io/badge/license-MIT-111111?style=for-the-badge)](LICENSE)

[**Live Dashboard**](https://wadezigh96.github.io/Swarm_Agent/index.html) · [**Payment Channels Program**](https://explorer.solana.com/address/CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX) · [**Submission**](SUBMISSION.md)

</div>

---

## 🧠 What is ChannelSwarm?

**ChannelSwarm** is a Solana-native prototype for agent-to-agent payments.

It combines:

- ⚡ **Payment Channels** — signed cumulative vouchers for micropayments
- 🤖 **Agent Swarm** — payer, oracle and trading agents coordinating together
- 🛡️ **Reputation** — score-gated agent participation
- 💳 **x402-style payments** — HTTP payment-required flow using signed vouchers
- 📈 **Stocknized Agent** — paper-trading layer showing how an RWA-style strategy can feed payment capacity

> **Honest status:** the repository implements the payment-channel wire format and demo lifecycle, while stock execution and production persistence remain intentionally mocked/simulated.

---

## ✨ Product Surface

| Module | What it does |
|---|---|
| **Agent Economy** | Coordinates Alpha, DataOracle and StockHunter |
| **Payment Channels** | Opens channels and creates signed cumulative vouchers |
| **Settlement** | Builds `settle`, `settleAndSeal` and close instructions |
| **x402-style HTTP** | Returns `402 Payment Required` and verifies signed payments |
| **Reputation** | Gates participation using agent reputation |
| **Stocknized** | Deterministic paper quotes + in-memory portfolio |
| **Dashboard** | Dark, agent-first GitHub Pages interface |

---

## 🔄 How it works

**Intent → Reputation → Payment Channel → Voucher → Agent Resource → Settlement**

```mermaid
flowchart TB
    subgraph ChannelSwarm["ChannelSwarm Runtime"]
        U["Agent intent / task"] --> O["Swarm Orchestrator"]
        O --> REP["Reputation Registry"]
        REP -->|allowed| CM["Channel Manager"]
        REP -->|blocked| X["Reject / explain"]

        CM --> OPEN["Open Payment Channel"]
        OPEN --> PC["Solana Payment Channels"]
        PC --> V["50-byte Ed25519 voucher"]

        V --> A["Agent-to-Agent resource"]
        A --> X402["x402-style HTTP"]
        X402 --> SET["Settle / SettleAndSeal"]
        SET --> PC

        O --> STOCK["Stocknized Agent"]
        STOCK --> PAPER["Paper portfolio"]
        PAPER --> O
    end

    SOL["Solana wallet / funded payer"] -.->|SOL + USDC| PC
    USER["Operator"] -.->|simulation or ONCHAIN=true| O
```

### Runtime layers

| Layer | Responsibility |
|---|---|
| **Swarm Orchestrator** | Coordinates the agents and demo lifecycle |
| **Reputation** | Controls participation using agent scores |
| **Channel Manager** | Creates channels, vouchers and settlement paths |
| **Payment Channels** | Solana on-chain settlement primitive |
| **x402-style HTTP** | Payment-required resource flow using signed vouchers |
| **Stocknized Agent** | Paper-trading strategy and simulated portfolio |

## 💸 Payment Channel

The implementation uses the live Solana Payment Channels program:

```
CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX
```

Voucher wire format:

```
50 bytes
├── 2 bytes   magic/version
├── 32 bytes  channel PDA
├── 8 bytes   cumulative amount
└── 8 bytes   expiry
```

Each voucher is authenticated with **Ed25519**.

---

## 🤖 Agent Roster

| Agent | Role | Current mode |
|---|---|---|
| **Alpha** | Payment coordinator | Simulation / optional on-chain |
| **DataOracle** | Data signal provider | Demo |
| **StockHunter** | Strategy + stocknized layer | Paper trading |

---

## 🧪 Current implementation status

| Capability | Status |
|---|:---:|
| 50-byte voucher + Ed25519 | ✅ |
| Deterministic channel PDA | ✅ |
| `open` instruction builder | ✅ |
| `settle` instruction builder | ✅ |
| `settleAndSeal` instruction builder | ✅ |
| `requestClose` path | ✅ |
| Agent swarm demo | ✅ |
| Reputation gating | ✅ |
| x402-style HTTP server | ✅ |
| Automated tests | ✅ |
| TypeScript build | ✅ |
| Real tokenized-equity execution | ⏳ |
| Production persistence | ⏳ |

---

## 🚀 Quick Start

```bash
git clone https://github.com/wadezigh96/Swarm_Agent.git
cd Swarm_Agent
npm install

npm test
npm run demo
```

For an on-chain attempt:

```bash
# Fund the payer with SOL + the required devnet USDC first.
ONCHAIN=true npm run demo
```

Without a funded wallet, the demo safely remains in simulation mode.

---

## 🖥️ Dashboard

The repository includes a dedicated GitHub Pages dashboard:

**https://wadezigh96.github.io/Swarm_Agent/index.html**

The dashboard is intentionally separate from the repository page: it is the interactive product surface, while this README is the project/hackathon presentation layer.

---

## 🏗️ Architecture

```
src/
├── payments/
│   ├── channel-manager.ts
│   ├── instructions.ts
│   ├── voucher.test.ts
│   └── x402.test.ts
├── swarm/
│   └── orchestrator.ts
├── stock/
│   └── stocknized-agent.ts
├── reputation/
│   └── reputation.ts
└── wallet.ts

examples/
├── demo-swarm.ts
└── x402-demo.ts

docs/
└── index.html
```

---

## 🔐 Scope & limitations

- **Stocknized:** paper/mock quotes and an in-memory portfolio; no real equity settlement is claimed.
- **x402:** local x402-style transport, not a claim of full production x402 compatibility.
- **Persistence:** demo state is in memory.
- **On-chain execution:** opt-in and requires a funded payer.
- **Default demo:** simulation-first to avoid sending doomed transactions.

---

## 📚 Links

- [Repository](https://github.com/wadezigh96/Swarm_Agent)
- [Live Dashboard](https://wadezigh96.github.io/Swarm_Agent/index.html)
- [GitHub Actions](https://github.com/wadezigh96/Swarm_Agent/actions)
- [Submission](SUBMISSION.md)
- [Solana Payment Channels](https://github.com/solana-foundation/payment-channels)
- [Program Explorer](https://explorer.solana.com/address/CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX)

---

## 📄 License

MIT · Built for Solana Hackathons 2026
