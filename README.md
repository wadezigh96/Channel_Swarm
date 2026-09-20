# ChannelSwarm

**Autonomous Agent Economy on Solana**

[Live Dashboard](https://wadezigh96.github.io/Swarm_Agent/index.html) · [Explorer Program](https://explorer.solana.com/address/CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX) · [Submission](SUBMISSION.md)

Uses the **live mainnet program** from [solana-foundation/payment-channels](https://github.com/solana-foundation/payment-channels) (`CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX`).

## Status

| Layer | Status |
|-------|--------|
| 50-byte voucher + Ed25519 | Implemented + tested |
| PDA seeds (`channel`, payer, payee, mint, signer, salt, open_slot) | Implemented |
| `open` / `settle` / `settleAndSeal` / `requestClose` builders | Implemented (ADR-003 wire format) |
| Demo cycle (agents → vouchers → stock → reputation) | Works in **sim** mode |
| Live on-chain `open` + `settle` | Built; sends only if `ONCHAIN=true` **and** payer has SOL + USDC |
| `settleAndSeal` lifecycle path | Implemented + instruction-tested |
| Automated CI (`npm test` + `npm run build`) | Implemented |
| Stocknized trades | Paper / mock quotes — no real equity settlement yet |
| HTTP x402-style server | Implemented + tested locally; not claimed as full production x402 compatibility |

Without a funded wallet the demo **falls back to simulation** instead of sending a doomed transaction.

## Quick Start

```bash
git clone https://github.com/wadezigh96/Swarm_Agent.git
cd Swarm_Agent
npm install
cp .env.example .env

npm test
npm run demo
```

On-chain attempt (devnet):

```bash
# fund the keypair with SOL + devnet USDC first
ONCHAIN=true npm run demo
```

## Architecture

```
Alpha (payer)  --open channel-->  Payment Channels program
               --20 vouchers-->   off-chain Ed25519 (x402-style)
StockHunter    --paper trades-->  simulated equity book
Alpha          --settle-------->  Ed25519 precompile + settle ix
Reputation     --gates open---->  min score 0.5
```

## Project Structure

```
src/payments/channel-manager.ts   # state machine + send path
src/payments/instructions.ts      # open/settle/seal wire format
src/payments/voucher.test.ts
src/wallet.ts
src/swarm/orchestrator.ts
src/stock/stocknized-agent.ts
src/reputation/reputation.ts
examples/demo-swarm.ts
docs/                             # GitHub Pages dashboard
```

## License

MIT · Built for Solana Hackathons 2026


## What is still intentionally open

- **Real tokenized-equity execution:** the Stocknized agent currently uses deterministic demo prices and an in-memory paper portfolio. No real stock/RWA transaction is claimed.
- **HTTP x402 transport:** a local HTTP x402-style server now enforces signed channel vouchers, price, channel ceiling, expiry, and replay protection. It is a demo transport, not a claim of full production x402 compatibility.
- **Production persistence:** reputation and channel state are in memory for the demo.
- **Mainnet funding:** on-chain execution remains opt-in and requires a funded payer; the default demo stays in simulation mode.

The repository now has automated CI that runs the test suite and TypeScript build on pushes and pull requests to `main`.
