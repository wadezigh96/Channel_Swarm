# ChannelSwarm — Environment Setup (Sandbox first)

This guide configures the feature branch without exposing secrets in GitHub or chat. Start with **Vercel Preview** only. Do not use PayPal Live credentials and do not send a PYUSD Mainnet payment until the receiving address and amount have been checked.

## 1. Vercel AI Gateway

The default model is `nvidia/nemotron-3.5-lightning-free`. It is currently listed as free on Vercel AI Gateway and supports structured outputs. The free NVIDIA endpoint may log prompts and outputs for model improvement. Use only non-sensitive demo text.

- `AI_GATEWAY_MODEL`: optional override; default is `nvidia/nemotron-3.5-lightning-free`.
- `AI_GATEWAY_API_KEY`: optional if Vercel OIDC is available in the function runtime.
- `CHANNELSWARM_API_TOKEN`: required. Generate a random token locally, for example in Termux:

```bash
openssl rand -hex 32
```

Copy the generated value directly into the Vercel environment variable. Do not paste it into GitHub, this chat, or a public demo. Enter the same token into the password field on `/checkout.html` when testing the AI routing button. The page does not save it.

## 2. PayPal Developer Platform — Sandbox only

1. Open https://developer.paypal.com/ and sign in.
2. Open **Apps & Credentials** and select **Sandbox**.
3. Create or select a Sandbox REST app.
4. Add these values to Vercel Preview:
   - `PAYPAL_CLIENT_ID`
   - `PAYPAL_CLIENT_SECRET`
5. Set `APP_BASE_URL` to the public origin of the preview app, or let Vercel's deployment URL be used automatically.
6. In the Sandbox app's **Webhooks** section, add:
   `https://YOUR-PREVIEW-DOMAIN/api/paypal/webhook`
7. Subscribe to:
   - `CHECKOUT.ORDER.APPROVED`
   - `CHECKOUT.PAYMENT-APPROVAL.REVERSED`
   - `PAYMENT.CAPTURE.PENDING`
   - `PAYMENT.CAPTURE.COMPLETED`
   - `PAYMENT.CAPTURE.DENIED`
8. Copy the created webhook ID into `PAYPAL_WEBHOOK_ID`.

Use Sandbox buyer credentials only. The application calls `api-m.sandbox.paypal.com`; it has no PayPal Live payment path. The webhook currently verifies and acknowledges signed events but does not store durable fulfillment state.

## 3. PYUSD on Solana Mainnet

Set the following server-side values:

- `PYUSD_TREASURY_WALLET`: the public wallet address that should receive PYUSD. Use a normal wallet address, not a token account, mint or program address.
- `PYUSD_SOLANA_RPC_URL`: recommended reliable Solana Mainnet RPC URL. If unset, the code uses the public Mainnet RPC, which may be rate-limited.

The receiving wallet's private key/seed phrase is never required by this application and must never be added to Vercel for this flow. The payer wallet signs the transaction locally. Payer needs PYUSD and SOL for network fees and possible associated-token-account rent.

PYUSD Mainnet details:
- Mint: `2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo`
- Program: Token-2022
- Decimals: 6

The code checks Mainnet genesis, mint decimals, transfer-fee/hook settings, payer/treasury token accounts, exact amount, signer and finalized transaction. PYUSD has issuer permanent-delegate and freeze controls. The issuer may freeze accounts or transfer/burn tokens under its controls.

**Important:** PayPal Sandbox fiat checkout does not automatically become PYUSD. The PYUSD path transfers tokens already held by the connected Solana wallet. PayPal's ability to hold/withdraw PYUSD varies by region and account eligibility.

## 4. Run and test

For local testing:

```bash
npm install
npm test
npm run build
npx vercel dev
```

Open `http://localhost:3000/checkout.html`. For PayPal local return URLs, set `APP_BASE_URL=http://localhost:3000` in your untracked `.env.local` if needed.

Test order:
1. AI routing with non-sensitive text.
2. PayPal Sandbox buyer approval and capture.
3. PayPal Sandbox webhook signature verification.
4. PYUSD Mainnet only after the treasury wallet and amount are independently checked and the operator explicitly approves a real transaction.

## 5. Do not change these settings for this integration

- Do not turn on Solana channel broadcast or Backpack live trading.
- Do not put private keys, PayPal secrets, AI keys, API tokens or seed phrases in source control.
- Do not merge or deploy this branch unless separately authorized.
- Do not treat a repeated PYUSD verification response as one-time fulfillment; durable database-backed idempotency is still required before releasing valuable services.
