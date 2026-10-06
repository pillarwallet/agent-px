# Wallet And Transactions

## Wallet access

Use `useTransactionKit()` for the active kit and wallet address. Use `useAuthAccount()` for the selected account and chain state. The transaction kit supplies Etherspot-backed SDK access:

```ts
const sdk = await kit.getEtherspotProvider().getSdk(chainId);
```

The active EOA may be delegated to the Kernel implementation through EIP-7702. EIP-7702 authorization and installation helpers live under `src/utils/` and existing send/install flows should be reused.

## Approval UI

`useWalletApproval()` exposes `requestApproval`. Use it for:

- typed-data signatures;
- personal/message signatures;
- regular transactions;
- user-operation or batched transaction approvals where the request is represented in the common UI.

The approval UI should explain the action, chain, account, and destination. On approval, perform the SDK call and wait for the RPC response. On rejection, leave the originating operation pending or failed in a clear state.

## Direct transactions

For a regular transaction, use the SDK/client already used by the Send modal. Do not invent a new RPC selection strategy. Custom chains must use their configured RPC; primary chains use the configured Etherspot/approved provider path. Avoid public fallback RPCs.

After submission, display a confirmation state while waiting for the transaction receipt. Store the returned transaction hash and provide a copy action. A locally constructed hash is not confirmation.

## Gasless transactions

Gasless token payments use the bundler/user-operation route and must not run the normal `eth_estimateGas` path as if the wallet were paying native gas. Token selection must happen before estimation. The selected paymaster/token determines whether the flow calls user-operation gas estimation and paymaster methods.

## EIP-7702 installation

Policy installation is an on-chain action. The client prepares the installation through the automation API, builds the required calls/authorization, sends them through the common transaction approval flow, then submits only the mined transaction hash to the backend confirmation endpoint.

