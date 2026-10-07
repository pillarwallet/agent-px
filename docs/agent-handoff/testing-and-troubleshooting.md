# Testing And Troubleshooting

## Local checks

```bash
npm run lint
npm run test
npm run build
npm run build:extension
```

For a focused test, use Vitest with a file path. Reload `build-extension` in `chrome://extensions` after rebuilding the extension.

## Manual wallet checks

Test each of these after provider or transaction changes:

- locked wallet: unlock once, then connect to a dapp;
- already-unlocked wallet: connect without duplicate password/signature prompts;
- EIP-6963 discovery in Privy;
- regular native and ERC-20 sends;
- gasless token selection and user-operation estimation;
- EIP-7702 installation and transaction receipt confirmation;
- message signing and typed-data signing;
- popup and side-panel widths;
- narrow and wide modal layouts.

## Dapp compatibility

Check Google Sheets, Privy, Uniswap, Jumper, and a basic test page. A failure on Google Sheets usually means the provider bridge is doing more than exposing a passive wallet interface, or it is initialized in a document where it should not run.

## Common failures

- `Unsupported chain ID`: verify the chain is present in the client and backend supported-chain maps, and that the dapp's requested chain is not being overwritten by a stale provider value.
- `transaction gas price below minimum`: inspect fee fields and ensure priority fee is non-zero where the network requires it.
- `eth_estimateGas` failure for a token transfer: inspect the outer transaction's `value` and the inner calldata separately; a nested call's value is not automatically the outer transaction value.
- stale approval/waiting windows: check request IDs, pending-request cleanup, and whether a rejected/fulfilled request closes the shared approval state.
- missing alerts: verify the wallet address checksum, chain ID, backend URL, and `/v1/orders/list` response in the browser network panel.
