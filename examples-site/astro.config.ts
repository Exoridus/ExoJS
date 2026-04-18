import { defineConfig } from 'astro/config';
import lit from '@astrojs/lit';

export default defineConfig({
    integrations: [lit()],
    output: 'static',
    base: '/ExoJS/',
    build: {
        assets: '_astro',
    },
    vite: {
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
                        // Lit runtime — shared by all shell components; stable vendor chunk.
                        if (id.includes('/node_modules/lit/') || id.includes('/node_modules/@lit/') || id.includes('/node_modules/lit-html/') || id.includes('/node_modules/lit-element/')) return 'vendor-lit';
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
