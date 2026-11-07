# ChannelSwarm — Devpost Demo Video Script (2:45 max)

**Recording target:** 2 minutes 40–50 seconds, landscape 16:9, screen capture with clear English narration/subtitles. No background music unless properly licensed. Record only after the Sandbox and wallet checks below pass.

## Before recording
- Run the feature branch using `vercel dev` and open `/checkout.html`.
- Configure the Vercel AI Gateway model and API authentication, plus the UI's own `CHANNELSWARM_API_TOKEN`.
- Configure PayPal Sandbox app credentials and a Sandbox buyer account.
- Register the Sandbox webhook URL and set `PAYPAL_WEBHOOK_ID`.
- Configure the PYUSD treasury wallet and Mainnet RPC. Use a tiny amount only if the operator explicitly approves a real Mainnet payment.
- Never show secrets, private keys, seed phrases, or personal PayPal account data on screen.

## Timed storyboard and narration

### 0:00–0:20 — Problem and product
**Show:** ChannelSwarm dashboard, agent roster and payment-channel architecture.

**Say:** “ChannelSwarm is an AI-assisted agent economy on Solana. Agents coordinate tasks, use reputation controls, and exchange micropayments. This build adds PayPal Checkout and PayPal USD on Solana without removing the original payment-channel utility.”

### 0:20–0:55 — AI intent and payment-rail routing
**Show:** Checkout page → AI intent box. Enter: “Pay four US dollars for an agent service using PayPal checkout.” Run the AI route.

**Say:** “Vercel AI Gateway recommends an available agent and a payment rail. Here it selects PayPal Sandbox for a fiat checkout. The response is schema-validated and explicitly requires human approval. AI never signs or captures a payment.”

**Show:** The result's `routeTo`, `paymentRail`, and `requiresHumanApproval` fields.

### 0:55–1:35 — PayPal Sandbox buyer checkout
**Show:** Enter a small Sandbox amount, create order, redirect to PayPal Sandbox, approve with the test buyer, return to ChannelSwarm, and show completed capture status.

**Say:** “The buyer approves the order on PayPal Sandbox. Our backend retrieves the order, checks approval status, amount, currency and request reference, then captures it with an idempotency key. Webhook signatures are verified through PayPal's verification API.”

**Show:** The order/capture result. Do not show Sandbox credentials.

### 1:35–2:05 — PYUSD on Solana Mainnet
**Show:** Connect a wallet holding PYUSD and SOL. Display the receiving wallet and amount. Approve a very small transaction only after checking the mint and recipient. Show the finalized Solana Explorer transaction.

**Say:** “For wallet-native settlement, ChannelSwarm accepts authentic PYUSD directly on Solana Mainnet. The wallet signs a Token-2022 TransferChecked transaction. The verifier checks finality, signer, mint, source and destination accounts, exact amount and the payment memo.”

**On-screen note:** “PYUSD Mainnet is a separate rail; PayPal Sandbox fiat is not automatically converted into PYUSD.”

### 2:05–2:30 — Original utility remains
**Show:** Original agent swarm / voucher / x402-style demo and Stocknized paper mode.

**Say:** “The original USDC Payment Channels and signed cumulative voucher flow remains unchanged for agent-to-agent micropayments. Reputation gates, x402-style payment requirements and the paper-first Stocknized agent remain part of the same product.”

### 2:30–2:45 — Close
**Show:** GitHub feature branch, README, test result.

**Say:** “ChannelSwarm combines AI-assisted agent routing, PayPal Sandbox checkout, PYUSD Mainnet payments and Solana payment channels—with explicit human approval and transparent payment verification.”

## Recording acceptance checklist
- [ ] Show the actual app functioning; do not use static mockups as proof.
- [ ] Show one successful PayPal Sandbox buyer approval and capture.
- [ ] Show a real finalized PYUSD transaction only if explicitly approved and the amount/recipient are verified.
- [ ] Show the original voucher/payment-channel functionality.
- [ ] Keep the final video under three minutes and upload it publicly to YouTube.
- [ ] Paste the public YouTube URL into `SUBMISSION.md` and the Devpost form.
