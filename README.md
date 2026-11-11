# ⚡ ChannelSwarm

> **Autonomous Agent Economy on Solana**

<div align="center">

**Agents that can earn · spend · coordinate · settle**

[![Solana](https://img.shields.io/badge/Solana-Mainnet-9945FF?style=for-the-badge&logo=solana&logoColor=white)](https://solana.com/)
[![PayPal](https://img.shields.io/badge/PayPal-Orders%20v2-00457C?style=for-the-badge&logo=paypal&logoColor=white)](https://developer.paypal.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![CI](https://img.shields.io/github/actions/workflow/status/wadezigh96/Channel_Swarm/ci.yml?branch=main&style=for-the-badge&label=CI)](https://github.com/wadezigh96/Channel_Swarm/actions)
[![License](https://img.shields.io/badge/license-MIT-111111?style=for-the-badge)](LICENSE)

[**Live Dashboard**](https://swarm-agent-beta.vercel.app/) · [**Payment Channels Program**](https://explorer.solana.com/address/CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX) · [**Submission**](SUBMISSION.md)

</div>

---

## 🧠 What is ChannelSwarm?

**ChannelSwarm** is a Solana-native prototype for agent-to-agent services and payments. Solana stablecoin channels and PayPal fiat checkout are separate, explicitly selected rails.

It combines:

- ⚡ **Payment Channels** — signed cumulative vouchers for micropayments
- 🤖 **Agent Swarm** — payer, oracle and trading agents coordinating together
- 🛡️ **Reputation** — score-gated agent participation
- 💳 **x402-style payments** — HTTP payment-required flow using signed vouchers
- 📈 **Stocknized Agent** — tokenized-equity strategy with **paper default** and **opt-in live execution** (Backpack RFQ or Jupiter xStock swaps)
- 💵 **PYUSD support** — official PayPal USD mint on Solana (Token-2022)
- 💳 **PayPal Orders** — separate fiat checkout via PayPal Orders v2 (create, inspect approval, capture; no automatic double charge)

> **Honest status:** official channel lifecycle builders, a verified PayPal webhook route, a durable KV order/event ledger, and an advisory AI Gateway rail recommender are implemented in the PR branch. This is code-level readiness, not proof of a funded mainnet or PayPal Live end-to-end run. Mainnet transactions and PayPal Live capture remain independently locked.

---

## ✨ Product Surface

| Module | What it does |
|---|---|
| **Agent Economy** | Coordinates Alpha, DataOracle and StockHunter |
| **Payment Channels** | Opens channels and creates signed cumulative vouchers |
| **Settlement** | Builds `settle`, `settleAndSeal` and close instructions |
| **x402-style HTTP** | Returns `402 Payment Required` and verifies signed payments |
| **Reputation** | Gates participation using agent reputation |
| **Stocknized** | Pyth (or paper) quotes + `EXECUTION_MODE=paper\|backpack\|jupiter` |
| **PYUSD** | Official mint identification; rejected for channel use when active Token-2022 extensions are outside the deployed program allowlist |
| **PayPal Orders** | Separate checkout; authenticated create/capture routes, verified webhook, persistent KV ledger, and independent Live capture gate |
| **AI Gateway** | Payment-rail recommendation only; human approval is required and the model cannot execute payments |
| **Dashboard** | Demo snapshot plus 15-second RPC/configuration health checks; not live payment telemetry |

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
        STOCK --> EXEC["paper / backpack / jupiter"]
        EXEC --> PROOF["Execution proof"]
        PROOF --> O
    end

    SOL["Solana wallet / funded payer"] -.->|SOL + supported SPL token| PC
    PAYPAL["PayPal checkout (separate intent)"] -.->|selected fiat rail, never auto-combined| O
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
| **Stocknized Agent** | Strategy + unified execution path + proofs |
| **PayPal Client** | Separate Orders v2 checkout; optional webhook-signature verification |

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

### PYUSD (PayPal USD)

Official PYUSD mint addresses (Token-2022, 6 decimals; address selection only):

| Network | Mint |
|---------|------|
| Mainnet | `2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo` |
| Devnet  | `CXk2AMBfi3TwaEL2468s6zP8xq9NxTXjp9gjMgzeUynM` |

The deployed Payment Channels program has a documented Token-2022 extension allowlist. PYUSD has active extensions outside that allowlist (including PermanentDelegate), so ChannelSwarm rejects it for channel escrow. The mainnet channel candidate is classic SPL USDC; PYUSD remains identified but is not enabled for this channel path.

---

## 📈 Tokenized-equity execution

| Mode | Env | What happens |
|---|---|---|
| **paper** (default) | `EXECUTION_MODE=paper` | Simulated fills + local `ExecutionProof` |
| **backpack** | `EXECUTION_MODE=backpack` + API keys | STOCK RFQ submit → optional auto-accept → RFQ history proof |
| **jupiter** | `EXECUTION_MODE=jupiter` + mints + funded wallet | On-chain Jupiter swap of xStock mints → `txSignature` proof |

```bash
# Safe demo (always works without keys)
npm run demo:equity

# Backpack live (credentials + balance required)
EXECUTION_MODE=backpack BACKPACK_LIVE_TRADING=true BACKPACK_AUTO_ACCEPT_RFQ=true npm run demo:equity

# Jupiter live (mints + funded wallet required)
EXECUTION_MODE=jupiter USDC_MINT=... XSTOCK_AAPL_MINT=... npm run demo:equity
```

---

## 🎯 Solana Request for Startups alignment

ChannelSwarm is aligned primarily with **Build the Future of Stablecoins** (agent-to-agent stablecoin payments and merchant settlement) and secondarily with **Open Marketplace for AI Inference** (a future service-provider marketplace paid through the same agent payment primitives). The repository currently implements a prototype swarm and payment primitives; it does not yet claim a production inference marketplace, durable provider discovery, or production settlement reconciliation. See the [Solana Request for Startups](https://solana.com/request-for-startups.md).

## 🤖 Agent Roster

| Agent | Role | Current mode |
|---|---|---|
| **Alpha** | Payment coordinator | Simulation / optional on-chain |
| **DataOracle** | Data signal provider | Demo |
| **StockHunter** | Strategy + stocknized layer | Paper default / opt-in live |

---

## 🧪 Current implementation status

| Capability | Status |
|---|:---:|
| 50-byte voucher + Ed25519 | ✅ |
| Deterministic channel PDA | ✅ |
| `open` instruction builder | ✅ |
| `settle` instruction builder | ✅ |
| `settleAndSeal` instruction builder (payee signature) | ✅ |
| `distribute` instruction builder + recipient splits | ✅ |
| `seal` forced-close instruction builder | ✅ |
| `reclaim` instruction builder | ✅ |
| `requestClose` path | ✅ |
| Agent swarm demo | ✅ |
| Reputation gating | ✅ |
| x402-style HTTP server | ✅ |
| Automated tests | ✅ |
| TypeScript build | ✅ |
| Tokenized-equity execution path (paper / backpack / jupiter + proofs) | ✅ |
| PayPal order/event ledger (Vercel KV / Upstash REST) | ⚠️ Code + tests; production credentials required |
| PYUSD mint identification | ✅ |
| PYUSD Token-2022 Payment Channels compatibility | ✅ Preflight verified; unsupported active extensions fail closed |
| PayPal Orders v2 create/get/capture + webhook endpoint + persistent ledger | ⚠️ Code + tests; sandbox credentials, webhook and KV required |
| AI Gateway rail advisor | ✅ Rules fallback verified; AI Gateway is optional |
| Funded Mainnet lifecycle | ⚠️ Simulation verified; funded mainnet requires explicit approval and operational validation |

---

## 🚀 Quick Start

```bash
git clone https://github.com/wadezigh96/Channel_Swarm.git
cd Channel_Swarm
npm install

npm test
npm run demo
npm run demo:equity
```

For an on-chain payment-channel attempt:

```bash
# Fund the payer with SOL + the required devnet USDC first.
NETWORK=devnet ONCHAIN=true npm run demo
```

With PYUSD:
```bash
USE_PYUSD=false NETWORK=devnet npm run demo
```

The default is simulation. If devnet on-chain mode is explicitly requested, missing mint/ATA/balance preflight now fails closed instead of silently pretending to settle.

### CLI and MCP integration

The repository includes a CLI for read-only PYUSD inspection, Solana preflight, simulation-first channel operations, and PayPal sandbox operations:

```bash
npm run cli -- pyusd info
npm run cli -- pyusd preflight
npm run cli -- paypal create --amount 5 --description "Agent settlement"
npm run cli -- paypal get --order-id ORDER_ID
npm run cli -- paypal capture --order-id ORDER_ID --confirm CAPTURE
npm run cli -- pyusd open --payee RECIPIENT_WALLET --amount 1
```

`npm run mcp` starts a newline-delimited MCP stdio server exposing PYUSD metadata, Solana preflight, and PayPal create/get/capture tools. Capture requires `confirm: "CAPTURE"`; on-chain execution remains behind the PR's independent transaction gates. PayPal Orders and PYUSD on Solana are separate settlement rails and are never silently converted into one another. See the [MCP PayPal Quickstart](docs/MCP_QUICKSTART.md) and the [PayPal Sandbox E2E guide](docs/MCP_PAYPAL_SANDBOX_E2E.md) for client configuration, automated test commands, approval flow, and webhook checks.

---

## 🖥️ Dashboard

The checked-in dashboard metrics remain static demo snapshots. A separate health panel polls `/api/status` every 15 seconds for RPC reachability and configuration readiness only; it does not show live balances, payments or settlement history.

The current production dashboard URL is still attached to the unchanged `main` deployment. The updated feature branch is available as a Vercel Preview through PR #1; do not treat the old production URL as proof that these branch changes are live.

---

## 🏗️ Architecture

```
src/
├── payments/
│   ├── channel-manager.ts
│   ├── instructions.ts
│   ├── pyusd.ts
│   ├── paypal-client.ts
│   ├── voucher.test.ts
│   ├── x402-server.ts
│   └── x402.test.ts
├── swarm/
│   └── orchestrator.ts
├── stock/
│   ├── stocknized-agent.ts
│   ├── jupiter-executor.ts
│   └── execution-mode.ts
├── execution/
│   ├── backpack-stock-client.ts
│   └── backpack-rfq-proof.ts
├── market/
│   └── pyth-client.ts
├── reputation/
│   └── reputation.ts
└── wallet.ts

examples/
├── demo-swarm.ts
├── equity-execution-demo.ts
├── stocklana-demo.ts
├── verify-backpack-stocks.ts
├── x402-demo.ts
└── paypal-swarm-demo.ts

docs/
└── index.html
```

---

## 🔐 Scope & limitations

- **Stocknized:** default is paper with local execution proofs. Live `backpack` / `jupiter` modes are opt-in and need credentials + funded accounts.
- **x402:** local x402-style transport, not a claim of full production x402 compatibility.
- **Persistence:** optional file-based persistence (reputation + stock portfolio) in `data/`. Default on for simulation.
- **On-chain payment channels:** opt-in and requires a funded payer.
- **Default demo:** simulation-first to avoid sending doomed transactions.
- **PYUSD:** official mints supported; on-chain usage requires Token-2022 compatible channel program.
- **PayPal:** sandbox Orders v2 for dual-rail settlement.

---

## 📚 Links

- [Repository](https://github.com/wadezigh96/Channel_Swarm)
- [Live Dashboard](https://swarm-agent-beta.vercel.app/)
- [GitHub Actions](https://github.com/wadezigh96/Channel_Swarm/actions)
- [Submission](SUBMISSION.md)
- [Solana Payment Channels](https://github.com/solana-foundation/payment-channels)
- [Program Explorer](https://explorer.solana.com/address/CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX)
- [PYUSD on Solana](https://solana.com/pyusd)
- [PayPal Developer](https://developer.paypal.com/)

---

## 📄 License

MIT · Built for PayPal AI Hackathon 2026 + Solana


## Mainnet and PayPal Live readiness

- Mainnet stays disabled by default. On-chain mode additionally requires `ONCHAIN=true`, `ALLOW_MAINNET_TRANSACTIONS=true`, and `MAINNET_TX_APPROVED=true`; these are not enabled by the example configuration.
- The channel candidate is classic SPL USDC (6 decimals). PYUSD is not enabled for Payment Channels because its active Token-2022 extensions are not all accepted by the deployed program.
- The channel lifecycle includes `open`, voucher signing, `settle`, payee-signed `settleAndSeal`, `distribute`, forced-close `requestClose`/`seal`, and delayed `reclaim`.
- PayPal routes: `POST /api/paypal/create-order`, `GET /api/paypal/return`, `POST /api/paypal/capture`, and `POST /api/paypal/webhook`. Checkout/capture routes require `CHANNELSWARM_API_TOKEN`; durable KV credentials are required. Webhooks never auto-capture.
- PayPal Live order creation requires `PAYPAL_LIVE_ENABLED=true`, public HTTPS return/cancel URLs and a registered webhook. Real capture separately requires `PAYPAL_LIVE_CAPTURE_ENABLED=true` and remains off by default.
- AI rail advice uses Vercel AI Gateway via `AI_GATEWAY_API_KEY` (or Vercel OIDC token in the function request) and `AI_GATEWAY_MODEL`. It is advisory only and cannot sign, create, or capture payments.
- `/api/status` reports RPC/configuration health only. The x402 cumulative-voucher replay watermark uses atomic KV storage. Vercel fails closed when KV is missing; the local in-memory fallback is for developer demos only.
- `ChannelManager` now checks `isOnchainMode()` itself, so callers cannot bypass the wallet environment gates by passing `onchain: true` directly.
- `.env.example` defaults to devnet USDC; use the documented mainnet USDC mint only when deliberately switching the network configuration.
- No Mainnet transaction, real PayPal capture, or Production deployment is performed by this preparation work.
