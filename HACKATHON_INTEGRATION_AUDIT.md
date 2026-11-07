# PayPal AI Hackathon — Integration Audit

Date: 2026-11-07
Base branch: main
Working branch: feat/paypal-ai-hackathon

## Scope and safety

This branch is isolated from `main`. No merge, deployment, live payment, wallet signing, or transaction broadcast is part of this work.

## Existing application audit

Reviewed the repository README, package manifest, environment example, swarm orchestrator, stock agent, payment channel manager, x402-style server, reputation registry, and dashboard.

Existing capabilities:
- Solana Payment Channels client and signed cumulative Ed25519 vouchers.
- Multi-agent orchestration with General, Data, and Stock roles.
- Reputation-gated participation.
- x402-style HTTP payment requirement and voucher verification.
- Stocknized Agent with deterministic/Pyth data and paper-first execution.
- A static HTML dashboard and simulation demo.

AI runtime finding:
- Initial audit found no AI model integration; the Vercel AI Gateway service and protected inference endpoint have since been added on this feature branch.
- Existing deterministic stock rules and reputation logic are not an AI model integration and must not be presented as one.
- The AI routing integration is present in source but remains unverified against a live Gateway model until credentials are configured and the endpoint is exercised.

PayPal runtime finding:
- Initial audit found no PayPal integration. This feature branch now contains a Sandbox-only Orders v2 client, a buyer-facing checkout page, and same-origin create-order and buyer-approved capture endpoints.
- The implementation validates order status, exact USD amount/currency and the unique custom_id reference before capture, and uses PayPal-Request-Id for idempotency.
- Added PayPal webhook signature verification via PayPal's verification API. It currently acknowledges/logs verified events; durable event and fulfillment storage remains outstanding.
- Sandbox credentials, webhook registration and end-to-end verification remain outstanding.
- Added direct PYUSD Mainnet checkout using the official Token-2022 mint, 6-decimal TransferChecked transaction, wallet signature, unique memo, Mainnet genesis check, mint extension checks and finalized transaction verification.
- The original USDC Payment Channels and 50-byte Ed25519 voucher flow is unchanged. PYUSD is a separate direct-payment rail because the current channel instruction builder targets the legacy SPL Token program.
- PayPal Sandbox checkout is not a fiat-to-PYUSD bridge; PYUSD checkout transfers tokens already held by the payer wallet.
- Solana payment channels are not a substitute for the required PayPal Developer Platform integration.

## Hackathon requirements

The project must meaningfully use both PayPal Developer Platform (free sandbox) and an AI tool/model/platform, provide a working prototype, public source repository with license, setup/run instructions, and a public YouTube demo under three minutes.

Official challenge: https://paypalaihackathon.devpost.com/
Official rules: https://paypalaihackathon.devpost.com/rules

## Vercel AI Gateway implementation added on feature branch

- Added `src/ai/gateway.ts` to call the Vercel AI Gateway OpenAI-compatible endpoint and validate a constrained agent-routing proposal.
- Added `api/ai/decision.ts` as a protected Vercel serverless endpoint (`POST /api/ai/decision`) using bearer-token authorization.
- Added mocked tests for valid proposals, missing credentials, unavailable agent roles, and mandatory human approval.
- Added server-side environment placeholders and README setup notes.
- AI output is advisory only: it cannot sign, transfer, trade, settle, or capture payments.
- Authentication supports `AI_GATEWAY_API_KEY` or Vercel OIDC token; model ID and endpoint bearer token still require configuration.
- GitHub Actions CI passed on commit `c6e748ec9f1a1188dcc62c65591f3b115744d0be`: all 25 tests passed and `npm run build` passed. The run used mocked AI/PayPal responses; no external model call or PayPal Sandbox transaction was made. No Vercel deployment has been created.

## Remaining integration work

1. Configure `AI_GATEWAY_MODEL`, AI Gateway credentials/OIDC, and `CHANNELSWARM_API_TOKEN` in Vercel Preview; exercise the AI demo UI.
2. Configure `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, and `APP_BASE_URL`; register the Sandbox webhook URL and run a complete buyer approval/capture test.
3. Configure `PYUSD_TREASURY_WALLET` and a reliable `PYUSD_SOLANA_RPC_URL`; verify the recipient address and test a very small Mainnet payment only after explicit operator approval.
4. Add durable storage and idempotent fulfillment before using payment proofs to unlock valuable services.
5. Record a public YouTube demo under three minutes, then complete the Devpost form.

## Previous PayPal implementation notes



1. Configure Sandbox-only `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` in the Vercel project; do not use live credentials.
2. Add and test PayPal webhook signature verification using the Webhooks API.
3. Add a buyer-facing checkout/approval UI that calls the protected endpoints without exposing server secrets.
4. Run the mocked test suite and TypeScript build, then perform a controlled Sandbox end-to-end test after credentials are configured.
5. Connect the AI proposal to the checkout flow with explicit operator/buyer confirmation and audit events. The AI must never trigger capture itself.
6. Keep Solana Payment Channels as the agent-to-agent micropayment layer; clearly distinguish simulation from on-chain settlement.

## Remaining setup and verification

The AI runtime decision is resolved: Vercel AI Gateway is selected. Configure a supported model ID, AI Gateway API key or Vercel OIDC, and a separate CHANNELSWARM_API_TOKEN before exercising the protected endpoint.

The Vercel project environment audit (decrypt disabled) did not show `AI_GATEWAY_API_KEY`, `AI_GATEWAY_MODEL`, `CHANNELSWARM_API_TOKEN`, `PAYPAL_CLIENT_ID`, or `PAYPAL_CLIENT_SECRET`. No secret values were read. Configure these in Preview first before live endpoint testing. npm install reported 8 dependency advisories (4 moderate, 4 high); no automatic dependency upgrades were applied.
