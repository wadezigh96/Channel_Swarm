# ChannelSwarm operator checklist

The repository changes add the integration paths, but real PayPal sandbox, AI Gateway, and funded-mainnet checks require settings in the project owner’s accounts. Do not paste private keys or client secrets into Devpost, source files, or browser code.

## PayPal sandbox

1. In Vercel, set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `PAYPAL_MODE=sandbox` as server-only environment variables.
2. Create an Upstash Redis REST database and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in Vercel. These are required for durable orders, webhook deduplication, and API rate limits.
3. Set `APP_URL` to the deployed dashboard origin, for example `https://swarm-agent-beta.vercel.app`.
4. Register `https://<your-domain>/api/paypal-webhook` in the PayPal developer dashboard. Subscribe to `CHECKOUT.ORDER.APPROVED`, `CHECKOUT.ORDER.COMPLETED`, and relevant `PAYMENT.CAPTURE.*` events. Copy its webhook ID into `PAYPAL_WEBHOOK_ID`.
5. Redeploy, create a sandbox order from the dashboard, approve it using a PayPal sandbox buyer account, and verify the return flow captures the order. Check the order status in the dashboard/ledger and verify webhook deliveries in PayPal.
6. Keep `PAYPAL_ALLOW_LIVE=false` and `PAYPAL_AUTO_ORDER=false`. Live mode is intentionally blocked until separately reviewed and enabled.

## Rail advisor

1. Optionally configure `AI_GATEWAY_BASE_URL`, `AI_GATEWAY_API_KEY`, and `AI_GATEWAY_MODEL` in Vercel.
2. Redeploy and try the dashboard advisor. It must return a recommendation only; the advisor does not create orders or submit transactions.
3. If not configured, the rule-based advisor remains available.

## PYUSD and mainnet

1. Check the mint owner and active Token-2022 extensions against the program's supported extension set. The application preflight fails closed for unsupported extensions.
2. Review the exact RPC, mint, payer public key, available token balance, SOL fee/rent budget, payee, and program ID.
3. Obtain explicit operator approval before setting `ONCHAIN=true` or using a funded wallet. The mainnet lifecycle has not been executed by this code change.
4. Begin with a controlled test amount and a reviewed runbook. Do not use a key with unrelated assets.

## Release

Run `npm test` and `npm run build`, push/review the changes in the GitHub repository, then redeploy the Vercel project. The public dashboard continues to serve the prior deployment until the updated repository is deployed.
