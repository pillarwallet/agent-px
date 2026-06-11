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

const extensionManifest = {
  manifest_version: 3,
  name: 'PillarX',
  description: 'PillarX browser extension wallet',
  version: packageJson.version ?? '1.0.0',
  action: {
    default_title: 'PillarX',
    default_popup: 'extension/popup.html',
  },
  options_ui: {
    page: 'extension/options.html',
    open_in_tab: true,
  },
  background: {
    service_worker: 'assets/background.js',
    type: 'module',
  },
  permissions: ['storage'],
  host_permissions: ['<all_urls>'],
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
  envPrefix: ['VITE_', 'ARC_'],
  plugins: [react(), svgr(), dynamicImport(), basicSsl(), emitManifestPlugin()],
  build: {
    outDir: 'build-extension',
    emptyOutDir: true,
    commonjsOptions: { transformMixedEsModules: true },
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, 'extension/popup.html'),
        options: path.resolve(__dirname, 'extension/options.html'),
        background: path.resolve(__dirname, 'src/extension/background.ts'),
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
