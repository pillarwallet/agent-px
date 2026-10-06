# Architecture

## Runtime surfaces

- `src/main.tsx` boots the web application.
- `extension/*.html` are the Manifest V3 entry pages.
- `src/extension/background.ts` owns extension runtime coordination.
- `src/extension/contentScript.ts` bridges page messages to the extension runtime.
- `src/extension/inpage.ts` exposes the EIP-1193 provider in the dapp page.
- `src/components/BottomMenuModal/` contains the wallet's main modal surfaces.
- `src/apps/` contains embedded apps. App-specific API and UI should stay inside the app folder unless the behavior is shared.
- `src/providers/` contains cross-cutting React contexts, including wallet approval, transaction kit, account history, and automations.
- `src/services/` contains Redux Toolkit Query services. `automationApi.ts` is the backend integration for policies and orders.

## State and dependencies

Redux is configured in `src/store.ts`. RTK Query services should own server data and cache invalidation. React context is used for active UI workflows that span components.

The wallet is accessed through `useTransactionKit()` and `useAuthAccount()`. Do not instantiate a second wallet client inside a component unless the existing provider cannot support the operation.

## UI conventions

Bottom-menu screens are composed through `src/components/BottomMenu/` and `src/components/BottomMenuModal/`. Shared approval flows use `useWalletApproval()` and should open the common approval UI rather than browser-native prompts or one-off transaction popups.

Prefer existing styled-components, icons, spacing, and modal primitives. Keep modal content responsive to popup and side-panel widths; avoid fixed widths that leave blank space or clip text.

## Environment

Copy `.env.example` to `.env`. Common values include `VITE_ETHERSPOT_BUNDLER_API_KEY`, `VITE_ALCHEMY_API_KEY`, `VITE_REOWN_PROJECT_ID`, `VITE_PAYMASTER_URL`, and `VITE_AUTOMATION_API_URL` when using the automation backend.

Never commit secrets. Public client configuration belongs in `VITE_*` variables only when it is intended to be exposed to the browser.

