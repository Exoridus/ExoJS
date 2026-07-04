// Default import on purpose: the package's ESM build exports the plugin as
// `default` only (the .d.ts advertises a named export it doesn't ship).
import codecovAstroPlugin from '@codecov/astro-plugin';
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SHIKI_THEMES } from './src/lib/shiki-theme';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Codecov Bundle Analysis for the site bundle — upload only when the token is
// present (CI); local builds stay offline. Placed after all other integrations
// per the plugin's docs.
const codecovIntegrations = process.env.CODECOV_TOKEN
    ? [
          codecovAstroPlugin({
              enableBundleAnalysis: true,
              bundleName: 'site',
              uploadToken: process.env.CODECOV_TOKEN,
              telemetry: false,
          }),
      ]
    : [];

export default defineConfig({
    integrations: [react(), mdx(), ...codecovIntegrations],
    output: 'static',
    base: '/ExoJS/',
    i18n: {
        locales: ['en', 'de'],
        defaultLocale: 'en',
        routing: {
            prefixDefaultLocale: true,
            redirectToDefaultLocale: false,
        },
    },
    markdown: {
        syntaxHighlight: 'shiki',
        shikiConfig: {
            themes: SHIKI_THEMES,
        },
    },
    build: {
        assets: '_astro',
    },
    vite: {
        resolve: {
            alias: {
                '~examples': path.resolve(__dirname, '../examples'),
            },
        },
        server: {
            fs: {
                allow: ['..'],
            },
        },
        build: {
            target: 'es2020',
            // Monaco core is irreducibly large (~4.5 MB) and is now lazy-loaded via a
            // dynamic import in Editor.ts — it is not on the initial render path. The
            // default 500 kB limit would always fire for this lazy vendor chunk, which
            // is a false positive after the real code-splitting work has been done.
            chunkSizeWarningLimit: 5500,
            rollupOptions: {
                output: {
                    manualChunks(id) {
                        // Monaco editor core — isolated so its hash is stable across
                        // app-code changes and workers/language-packs are kept separate
                        // by Monaco's own internal dynamic imports.
                        if (id.includes('/node_modules/monaco-editor/')) return 'vendor-monaco';
                        // React runtime — shared by all hydrated islands; stable vendor chunk.
                        if (
                            id.includes('/node_modules/react/') ||
                            id.includes('/node_modules/react-dom/') ||
                            id.includes('/node_modules/@astrojs/react/') ||
                            id.includes('/node_modules/@monaco-editor/react/')
                        )
                            return 'vendor-react';
                    },
                },
            },
        },
        optimizeDeps: {
            // Monaco's ESM build is large and complex — exclude it from Vite's
            // pre-bundler (esbuild) so it's served directly from node_modules in
            // dev and code-split naturally by Rollup in production.
            exclude: ['monaco-editor'],
        },
    },
});
