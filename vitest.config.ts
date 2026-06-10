import { fileURLToPath } from 'node:url';

import { createJsdomTestProject, shaderStubPlugin, srcConditions } from '@codexo/exojs-config/vitest';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Note: Vite alias matching uses longest-first order. Subpath aliases must come
// before the root alias so '@codexo/exojs/rendering' resolves before '@codexo/exojs'.
// These map the PUBLIC cross-package specifiers to source for in-repo tests.
// Package-internal `#*` imports are NOT aliased — they resolve through each
// package's own package.json#imports map via the source conditions (see
// @codexo/exojs-config/vitest `srcConditions`).
const aliasConfig = [
  { find: '@codexo/exojs/extensions', replacement: fileURLToPath(new URL('./src/extensions/index.ts', import.meta.url)) },
  { find: '@codexo/exojs/rendering', replacement: fileURLToPath(new URL('./src/rendering.ts', import.meta.url)) },
  { find: '@codexo/exojs/debug', replacement: fileURLToPath(new URL('./src/debug/index.ts', import.meta.url)) },
  { find: '@codexo/exojs', replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url)) },
] as const;

// Shared resolution/plugin wiring for the repository-local browser projects.
//
// The top-level Vite `define` replaces `__DEV__` in files Vite transforms
// directly. Under the `#` subpath-imports model some engine modules (e.g.
// `src/core/dev.ts`) resolve through `package.json#imports` and can be
// pre-bundled by esbuild's optimizer, which does NOT apply this `define` — so
// the bare `__DEV__` would survive and throw `__DEV__ is not defined` in the
// browser runtime. The `_setup-dev-global` setup file (wired into every browser
// project below) installs `__DEV__` as a real global so the reference resolves
// regardless of how the module was bundled.
const browserBase = {
  resolve: { alias: aliasConfig, conditions: srcConditions },
  ssr: { resolve: { conditions: srcConditions } },
  plugins: [shaderStubPlugin],
  define: { __DEV__: JSON.stringify(true), __VERSION__: JSON.stringify('0.0.0'), __REVISION__: JSON.stringify('test') },
} as const;

// Per-project browser headedness:
//  - WebGL2 Chromium: new headless. EXOJS_BROWSER_HEADED=1 only for local headed debug.
//  - WebGL2 Firefox:  headless.
//  - WebGPU Chromium: new headless — WebGPU adapter is available via swiftshader.
//  - WebGPU Firefox:  headed — Firefox only exposes a WebGPU adapter in a headed session.
const headed = process.env['EXOJS_BROWSER_HEADED'] === '1';
const webgl2Headless = !headed;

// Setup run in every browser project to install the `__DEV__` global (see the
// browserBase note) before any engine module evaluates.
const browserSetupFiles = ['./test/rendering/browser/_setup-dev-global.ts'];

export default defineConfig({
  test: {
    coverage: {
      provider: 'istanbul',
      reporter: ['lcov', 'clover', 'text-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
    },
    projects: [
      // ── jsdom unit/integration projects (Core + extensions) ──────────────
      createJsdomTestProject({
        name: 'exojs',
        alias: aliasConfig,
        include: ['test/**/*.test.ts'],
        exclude: ['test/rendering/browser/**/*.test.ts'],
      }),
      createJsdomTestProject({
        name: 'exojs-particles',
        alias: aliasConfig,
        include: ['packages/exojs-particles/test/**/*.test.ts'],
      }),
      createJsdomTestProject({
        name: 'exojs-tilemap',
        alias: aliasConfig,
        include: ['packages/exojs-tilemap/test/**/*.test.ts'],
      }),
      createJsdomTestProject({
        name: 'exojs-tiled',
        alias: aliasConfig,
        include: ['packages/exojs-tiled/test/**/*.test.ts'],
      }),

      // ── browser-webgl-chromium — WebGL2 via Chromium headless ────────────
      {
        ...browserBase,
        test: {
          name: 'browser-webgl-chromium',
          globals: true,
          setupFiles: browserSetupFiles,
          include: ['test/rendering/browser/webgl2-*.test.ts'],
          browser: {
            enabled: true,
            headless: webgl2Headless,
            provider: playwright({
              launchOptions: { channel: 'chromium', args: ['--enable-webgl', '--use-angle=swiftshader'] },
            }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },

      // ── browser-webgl-firefox — WebGL2 via Firefox headless ──────────────
      {
        ...browserBase,
        test: {
          name: 'browser-webgl-firefox',
          globals: true,
          setupFiles: browserSetupFiles,
          include: ['test/rendering/browser/webgl2-*.test.ts'],
          browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: 'firefox' }] },
        },
      },

      // ── browser-webgpu — WebGPU via Chromium new headless (swiftshader) ──
      {
        ...browserBase,
        test: {
          name: 'browser-webgpu',
          globals: true,
          setupFiles: browserSetupFiles,
          include: ['test/rendering/browser/webgpu-*.test.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              launchOptions: { channel: 'chromium', args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] },
            }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },

      // ── browser-webgpu-firefox — WebGPU via Firefox headed ───────────────
      {
        ...browserBase,
        test: {
          name: 'browser-webgpu-firefox',
          globals: true,
          setupFiles: browserSetupFiles,
          include: ['test/rendering/browser/webgpu-*.test.ts'],
          browser: { enabled: true, headless: false, provider: playwright(), instances: [{ browser: 'firefox' }] },
        },
      },

      // ── browser-webgpu-firefox-dark — same as above, dark colour scheme ──
      {
        ...browserBase,
        test: {
          name: 'browser-webgpu-firefox-dark',
          globals: true,
          setupFiles: browserSetupFiles,
          include: ['test/rendering/browser/webgpu-*.test.ts'],
          browser: {
            enabled: true,
            headless: false,
            provider: playwright(),
            instances: [{ browser: 'firefox', contextOptions: { colorScheme: 'dark' } }],
          },
        },
      },
    ],
  },
  benchmark: {
    include: ['test/bench/**/*.bench.ts'],
  },
});
