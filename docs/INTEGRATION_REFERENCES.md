# Integration references

## Solana Payment Channels and Token-2022

The official Payment Channels repository identifies the deployed program as supporting both SPL Token and Token-2022, and its `open` instruction expects the mint's owning token program as an account. The local instruction builder was updated to choose Token-2022 ATA derivation when appropriate.

- [Official Payment Channels repository and lifecycle documentation](https://github.com/solana-foundation/payment-channels)
- [Official program entry point](https://github.com/solana-foundation/payment-channels/blob/main/program/payment_channels/src/lib.rs)
- [Official Token-2022 extension validation helper](https://github.com/solana-foundation/payment-channels/blob/main/program/payment_channels/src/instructions/helpers/token.rs)
- [Official open instruction account definition and transfer flow](https://github.com/solana-foundation/payment-channels/blob/main/program/payment_channels/src/instructions/open.rs)

The upstream mint-extension allowlist accepts metadata/group extensions (MetadataPointer, TokenMetadata, GroupPointer, TokenGroup, GroupMemberPointer, GroupMember) and rejects other Token-2022 mint extensions. The application mirrors that allowlist for a fail-closed preflight. This checks compatibility rules but does not constitute a funded mainnet transaction test of PYUSD.

## PayPal refund event and capture states

PayPal supports both full and partial refunds, including multiple partial refunds up to the captured total. Its server SDK capture-status model distinguishes `PARTIALLY_REFUNDED` (less than the capture amount refunded) from `REFUNDED` (amount greater than or equal to the capture amount). The webhook now looks up the current capture state before changing the application ledger, and the ledger applies monotonic status transitions to avoid stale capture/webhook responses replacing later terminal states.

- [PayPal webhook event names](https://developer.paypal.com/api/rest/webhooks/event-names)
- [PayPal issue-refund guide](https://developer.paypal.com/platforms/checkout/issue-refund)
- [PayPal server SDK capture-status model](https://github.com/paypal/PayPal-PHP-Server-SDK/blob/main/doc/models/capture-status.md)
