# Extension Provider And Injection

## Message path

The injected provider is exposed by `src/extension/inpage.ts`. It sends page requests with `window.postMessage` to `src/extension/contentScript.ts`. The content script adds origin, URL, title, and favicon metadata, then forwards the request to the background service worker with `chrome.runtime.sendMessage`.

The background layer handles wallet RPC requests and returns a response back through the same bridge. Keep request IDs unchanged across the bridge.

## EIP-1193 behavior

The provider implements `request`, `on`, `removeListener`, and `enable`. Account and chain changes must emit `accountsChanged` and `chainChanged`. Provider errors should retain numeric EIP-1193 error codes.

## EIP-6963

Wallet discovery should use EIP-6963 announcements so dapps such as Privy can discover the wallet without relying on a provider name or a specific `window` property. Provider identity must be stable and must not be recreated repeatedly during page initialization.

## Injection safety

The bridge currently restricts itself to top-level HTML documents and HTTP(S) pages, and skips non-HTML resources such as PDF/XML paths. Do not maintain a growing list of individual website exclusions. Broad page injection can break applications such as Google Sheets; keep the bridge passive, avoid DOM mutation, and expose only the provider/discovery events required by wallet standards.

When changing injection behavior, test Google Sheets, Privy, Uniswap, Jumper, and a plain HTML page. Reload the extension after every extension build.

