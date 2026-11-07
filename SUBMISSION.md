# Devpost Submission — ChannelSwarm

## Project Name
ChannelSwarm

## Tagline
AI agents that coordinate, earn and pay — with PayPal Checkout and PYUSD settlement on Solana.

## Short Description
ChannelSwarm is an AI-assisted multi-agent economy that routes tasks through Vercel AI Gateway, gates participation with reputation, and supports two complementary payment rails: PayPal Checkout in Sandbox and direct PayPal USD (PYUSD) transfers on Solana Mainnet. Its original Solana Payment Channels, signed cumulative vouchers and x402-style agent micropayments remain part of the product.

## Full Description

### The problem
AI agents can make decisions, but their ability to coordinate, pay for services and prove that a payment actually settled is fragmented. A separate on-chain transaction for every tiny agent action is expensive and operationally awkward.

### The solution
ChannelSwarm combines an AI-assisted agent coordinator with auditable payment flows:

1. **Vercel AI Gateway** proposes which agent should handle an intent. Its output is constrained and validated; AI cannot sign wallets, submit trades, settle channels or capture payments.
2. **PayPal Checkout (Sandbox)** demonstrates the PayPal Developer Platform integration required by the hackathon. A buyer approves an order on PayPal Sandbox; the backend checks order status, amount, currency and request reference before capture. PayPal webhook signatures are verified with PayPal's verification API.
3. **PYUSD on Solana Mainnet** lets a buyer pay a configured treasury wallet directly from a compatible Solana wallet. The app uses the official PYUSD Token-2022 mint, six decimals, a wallet-signed `TransferChecked` transaction and finalized on-chain verification.
4. **Solana Payment Channels** remain the agent-to-agent micropayment layer: signed cumulative Ed25519 vouchers, spending ceilings, reputation gating and x402-style HTTP payment requirements.
5. **Stocknized Agent** retains its paper-first tokenized-equity strategy and optional execution adapters.

### Why two payment rails?
PayPal Sandbox is the PayPal Developer Platform integration used to satisfy the hackathon's PayPal requirement. It is not a fiat-to-PYUSD bridge. PYUSD checkout is a separate Mainnet flow that transfers PYUSD already held in a user's wallet. The original Payment Channels client remains USDC-based; it is not falsely represented as a PYUSD channel because its current instruction client uses the legacy SPL Token program while PYUSD is a Token-2022 mint.

### Technical implementation
- Vercel AI Gateway: constrained agent-routing proposals with mandatory human approval.
- PayPal Orders v2 Sandbox: OAuth, create order, buyer approval, request-bound capture, idempotency and webhook signature verification.
- Solana Mainnet PYUSD: canonical mint `2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo`, Token-2022, six decimals.
- PYUSD verification checks finalized transaction status, payer signature, token mint, token accounts, exact atomic amount and unique memo reference.
- Original Solana Payment Channels: 50-byte Ed25519 voucher wire format, channel instructions, x402-style flow and reputation controls.
- Tests and TypeScript build run in GitHub Actions.

### Safety and honest limitations
- AI only proposes; a human approves any consequential action.
- PayPal integration is Sandbox-only in this build; no PayPal Live transactions are enabled.
- PYUSD Mainnet payments are real and irreversible, but this repository does not automatically convert PayPal fiat checkout proceeds into PYUSD.
- PYUSD payment verification is an on-chain proof endpoint; durable order/fulfillment storage is still required before using it to unlock valuable services in production.
- A compatible wallet must hold PYUSD and SOL for network fees. PayPal's PYUSD withdrawal availability varies by region and account eligibility.
- No Mainnet transaction was sent by the development process.

## How to run locally
1. Install Node.js 22+, npm and the Vercel CLI.
2. Clone this repository and run `npm install`.
3. Copy `.env.example` to `.env.local` and configure:
   - `AI_GATEWAY_MODEL` plus AI Gateway key/OIDC and `CHANNELSWARM_API_TOKEN`.
   - PayPal Sandbox `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`.
   - `PYUSD_TREASURY_WALLET` and a reliable `PYUSD_SOLANA_RPC_URL`.
   - Set `APP_BASE_URL` for local or custom-domain checkout return URLs.
4. Run `npm test` and `npm run build`.
5. Run `vercel dev` to serve the static checkout page and serverless API routes together.
6. Open `http://localhost:3000/checkout.html`. Use PayPal Sandbox buyer credentials for the sandbox flow. For PYUSD Mainnet, connect a wallet holding PYUSD and SOL; review every transaction in the wallet before signing.

## Links
- **GitHub:** https://github.com/wadezigh96/Channel_Swarm
- **Feature branch:** https://github.com/wadezigh96/Channel_Swarm/tree/feat/paypal-ai-hackathon
- **Dashboard:** https://swarm-agent-beta.vercel.app/
- **Checkout source:** https://github.com/wadezigh96/Channel_Swarm/blob/feat/paypal-ai-hackathon/docs/checkout.html
- **PYUSD Mainnet mint:** https://explorer.solana.com/address/2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo
- **Payment Channels program:** https://explorer.solana.com/address/CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX
- **Demo video (public YouTube, under 3 minutes):** ADD_PUBLIC_YOUTUBE_URL

## Submission checklist
- [ ] Configure PayPal Sandbox credentials and webhook ID.
- [ ] Configure the PYUSD treasury wallet and Mainnet RPC.
- [ ] Run a complete PayPal Sandbox buyer approval/capture test.
- [ ] Run a small PYUSD Mainnet payment only after reviewing the recipient and amount.
- [ ] Record and publish a working end-to-end demo on YouTube, under 3 minutes.
- [ ] Confirm the public repository license and setup instructions.
- [ ] Paste the final project description, repository URL, demo URL and video URL into Devpost.

## Team
Solo
