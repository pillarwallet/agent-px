/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

interface ImportMetaEnv {
  readonly ARC_TESTNET_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
