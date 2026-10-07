# Automations And Backend API

## Current flow

The reusable create-alert flow is provided by `src/providers/CreateAlertProvider.tsx` and `useCreateAlert()`. It currently:

1. collects chain, active policy, token, USDC amount, price condition, slippage, and expiry;
2. creates a draft order with `POST /v1/orders`;
3. asks the user to sign the returned typed-data consent;
4. submits the signature to `POST /v1/orders/:id/consent`;
5. invalidates the RTK Query `Orders` tag.

The provider is intentionally reusable from AI Insights and the Automations modal.

## Policy endpoints

`src/services/automationApi.ts` integrates:

- `GET /v1/policies` to list policies for a wallet, optionally filtered by chain;
- `POST /v1/policies` to create a policy;
- `POST /v1/policies/:id/installation/prepare` to obtain installation authorization and calls;
- `POST /v1/policies/:id/installation` to confirm a mined transaction hash.

Installation is not silent: it changes on-chain wallet state and should use the common approval UI.

## Alert listing

Do not use localStorage as the source of truth for alerts. Fetch the backend order
list with `POST /v1/orders/list`, sending the checksummed `walletAddress` and a
`chainId`, then render the returned orders and their status in the Alerts tab.
The current endpoint does not require a signature. Session-based authentication
is planned for a future backend revision.

## Order display

Order amounts are base units. USDC uses 6 decimals on the EVM chains listed in the UI, while BNB Smart Chain USDC uses 18 decimals in the current configuration. Keep formatting aligned with the chain/token metadata instead of assuming every token has 6 decimals.

## Future provider support

The backend policy currently supports the 0x allowance-holder provider. Do not advertise LiFi or Uniswap execution until a corresponding adapter, target policy, calldata validation, and tests exist.
