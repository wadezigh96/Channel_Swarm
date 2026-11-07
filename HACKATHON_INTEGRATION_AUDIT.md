# PayPal AI Hackathon — Integration Audit

Date: 2026-11-07
Repository: `wadezigh96/Channel_Swarm`
Base branch: `main`
Working branch: `feat/paypal-ai-hackathon`

## Safety boundary

- All changes are isolated to the feature branch.
- No merge, deployment, PayPal Live call, wallet signing, PYUSD Mainnet transfer, or Solana transaction broadcast was performed.
- Existing live-trading and channel execution settings were not changed.

## Existing ChannelSwarm utility preserved

- Solana Payment Channels and the existing USDC channel instruction builder.
- 50-byte Ed25519 signed cumulative vouchers.
- Multi-agent orchestration, reputation gates and x402-style payment requirements.
- Stocknized Agent and Pyth data, paper-first execution mode.
- Existing dashboard and simulation.

PYUSD is a separate direct-payment rail. The existing channel instruction builder targets the legacy SPL Token program; the official Solana PYUSD mint uses Token-2022. This branch does not falsely claim PYUSD has been substituted into the legacy USDC channel escrow.

## Implemented on this branch

### Vercel AI Gateway

- `src/ai/gateway.ts` calls the Vercel AI Gateway Chat Completions endpoint.
- Default model: `nvidia/nemotron-3.5-lightning-free`; `AI_GATEWAY_MODEL` can override it.
- The model proposes an available agent and payment rail: PayPal Sandbox, PYUSD Mainnet, existing channel voucher, or none.
- Output is schema-validated; payment-rail/action combinations are checked; every response requires human approval.
- The AI endpoint cannot sign, transfer, trade, settle, capture or broadcast.
- `/checkout.html` contains the interactive AI routing control. The operator enters the project API token; the page does not persist it.
- Authentication supports `AI_GATEWAY_API_KEY` or Vercel OIDC.
- Privacy warning is displayed: the free NVIDIA model may log prompts and outputs for model improvement. Do not submit personal, confidential or secret data.

### PayPal Developer Platform — Sandbox

- Buyer-facing checkout page at `docs/checkout.html`.
- PayPal Orders v2 Sandbox create-order and capture endpoints.
- Buyer return flow is bound to a unique request ID; capture verifies order status, exact USD amount/currency and `custom_id` before capture.
- Uses `PayPal-Request-Id` idempotency.
- Webhook endpoint calls PayPal's webhook-signature verification API before acknowledging/logging an event.
- All PayPal API calls are pinned to `https://api-m.sandbox.paypal.com`; no PayPal Live path exists.
- Webhook event persistence and downstream fulfillment are not implemented.

### PYUSD — Solana Mainnet

- Official Solana Mainnet mint: `2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo`.
- Token-2022 program, 6 decimals.
- Server prepares an unsigned transaction; the payer wallet signs it.
- Uses recipient associated Token-2022 account creation if needed, a payment memo immediately before `TransferChecked`, and a fixed treasury recipient.
- Checks Mainnet genesis, mint decimals, transfer-fee/hook configuration, payer/treasury wallet/account type, frozen token accounts, payer balance and exact atomic amount.
- Verifier checks finalized transaction, payer signer, PYUSD mint, source/destination token accounts, exact amount/decimals and memo reference.
- No server private key is used for payer signing.
- PayPal Sandbox fiat is not automatically converted into PYUSD. The PYUSD flow transfers tokens already held by the user's Solana wallet.
- PYUSD has active issuer permanent-delegate and freeze controls; this is disclosed in the checkout UI and README.

## Automated verification

GitHub Actions passed on commit `8a6447e55adb95568add4c7b5c5d0e476f7892c1`:
- `npm test`: 30 passed, 0 failed.
- `npm run build`: passed, including typechecking the `api/**` Vercel functions.

This CI uses mocked AI and PayPal responses. It does not prove live AI Gateway credentials, PayPal Sandbox account configuration, webhook registration, wallet compatibility or a real PYUSD Mainnet payment.

The CI dependency installation reported 8 advisories (4 moderate, 4 high). No automatic dependency upgrades were applied.

## Vercel environment audit

The project environment list was inspected with decryption disabled; no secret values were read. These names were not present:
- `CHANNELSWARM_API_TOKEN`
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_WEBHOOK_ID`
- `PYUSD_TREASURY_WALLET`

Also not present as project variables:
- `AI_GATEWAY_API_KEY` (Vercel OIDC may be used instead, but runtime auth has not been exercised).
- `PYUSD_SOLANA_RPC_URL` (optional; code falls back to public Mainnet RPC, which may be rate-limited).
- `APP_BASE_URL` (optional on Vercel; current deployment URL is used).

The model has a code default, so `AI_GATEWAY_MODEL` is optional.

## Remaining before Devpost submission

1. Set `CHANNELSWARM_API_TOKEN` in Vercel Preview and confirm AI Gateway OIDC or API-key authentication.
2. Add PayPal Sandbox client ID/secret, register the Sandbox webhook and set its webhook ID; run buyer approval/capture end-to-end.
3. Set the public `PYUSD_TREASURY_WALLET` and reliable Mainnet RPC; independently check the recipient address. Only then, and only with explicit operator approval, run a tiny real Mainnet payment.
4. Add durable storage and one-time idempotent fulfillment before using payment verification to unlock valuable services.
5. Record a working demo video, upload it publicly to YouTube, and keep it under three minutes.
6. Paste the final text, public repository/branch, setup instructions and YouTube URL into Devpost.

## Official challenge

- https://paypalaihackathon.devpost.com/
- https://paypalaihackathon.devpost.com/rules

The existing Vercel dashboard deployment is from the main branch and does not include these unmerged changes. The feature branch has not been deployed. The repository includes `ENV_SETUP.md`, `SUBMISSION.md` and `DEMO_SCRIPT.md` for local judge setup and submission preparation.
