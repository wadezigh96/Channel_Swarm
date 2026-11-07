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
- Initial audit found no PayPal integration. This feature branch now contains a Sandbox-only Orders v2 client plus protected create-order and approval-gated capture endpoints.
- The implementation validates order status and exact USD amount/currency before capture, and uses PayPal-Request-Id for idempotency.
- Webhook signature verification and a buyer-facing checkout UI are not implemented yet. Sandbox credentials and end-to-end verification remain outstanding.
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
- Tests/build have not yet been executed in this environment; no Vercel deployment has been created.

## Remaining PayPal work

1. Configure Sandbox-only `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` in the Vercel project; do not use live credentials.
2. Add and test PayPal webhook signature verification using the Webhooks API.
3. Add a buyer-facing checkout/approval UI that calls the protected endpoints without exposing server secrets.
4. Run the mocked test suite and TypeScript build, then perform a controlled Sandbox end-to-end test after credentials are configured.
5. Connect the AI proposal to the checkout flow with explicit operator/buyer confirmation and audit events. The AI must never trigger capture itself.
6. Keep Solana Payment Channels as the agent-to-agent micropayment layer; clearly distinguish simulation from on-chain settlement.

## Remaining setup and verification

The AI runtime decision is resolved: Vercel AI Gateway is selected. Configure a supported model ID, AI Gateway API key or Vercel OIDC, and a separate CHANNELSWARM_API_TOKEN before exercising the protected endpoint.

No PayPal credentials or AI secrets are present in this audit. Do not add fake credentials or claim the integration is functional until sandbox tests pass.
