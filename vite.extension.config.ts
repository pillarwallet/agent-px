import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, Plugin } from 'vite';
import dynamicImport from 'vite-plugin-dynamic-import';
import svgr from 'vite-plugin-svgr';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJson = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')
) as { version?: string };

const providerInjectionMatches = ['http://*/*', 'https://*/*'];

const extensionManifest = {
  manifest_version: 3,
  name: 'PillarX',
  description: 'PillarX browser extension wallet',
  version: packageJson.version ?? '1.0.0',
  icons: {
    16: 'icons/icon16.png',
    32: 'icons/icon32.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
  action: {
    default_title: 'PillarX',
    default_icon: {
      16: 'icons/icon16.png',
      32: 'icons/icon32.png',
      48: 'icons/icon48.png',
    },
  },
  options_ui: {
    page: 'extension/options.html',
    open_in_tab: true,
  },
  side_panel: {
    default_path: 'extension/sidepanel.html',
  },
  background: {
    service_worker: 'assets/background.js',
    type: 'module',
  },
  permissions: ['storage', 'sidePanel', 'offscreen'],
  host_permissions: ['<all_urls>'],
  content_scripts: [
    {
      matches: providerInjectionMatches,
      js: ['assets/contentScript.js'],
      run_at: 'document_start',
    },
  ],
  web_accessible_resources: [
    {
      resources: ['assets/inpage.js'],
      matches: providerInjectionMatches,
    },
  ],
} satisfies Record<string, unknown>;

const emitManifestPlugin = (): Plugin => ({
  name: 'pillarx-extension-manifest',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'manifest.json',
      source: JSON.stringify(extensionManifest, null, 2),
    });
  },
});

export default defineConfig({
  plugins: [react(), svgr(), dynamicImport(), basicSsl(), emitManifestPlugin()],
  build: {
    outDir: 'build-extension',
    emptyOutDir: true,
    commonjsOptions: { transformMixedEsModules: true },
    rollupOptions: {
      input: {
        approval: path.resolve(__dirname, 'extension/approval.html'),
        keyring: path.resolve(__dirname, 'extension/keyring.html'),
        popup: path.resolve(__dirname, 'extension/popup.html'),
        options: path.resolve(__dirname, 'extension/options.html'),
        sidepanel: path.resolve(__dirname, 'extension/sidepanel.html'),
        background: path.resolve(__dirname, 'src/extension/background.ts'),
        contentScript: path.resolve(
          __dirname,
          'src/extension/contentScript.ts'
        ),
        inpage: path.resolve(__dirname, 'src/extension/inpage.ts'),
      },
      external: ['/functions/**'],
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  resolve: {
    alias: {
      '@': path.join(__dirname, 'src/apps'),
      crypto: 'crypto-browserify',
    },
  },
});
