import { fileURLToPath } from 'node:url';

import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Note: Vite alias matching uses longest-first order. Subpath aliases must come
// before the root alias so '@codexo/exojs/rendering' resolves before '@codexo/exojs'.
const aliasConfig = [
  { find: '@codexo/exojs/extensions', replacement: fileURLToPath(new URL('./src/extensions/index.ts', import.meta.url)) },
  { find: '@codexo/exojs/rendering', replacement: fileURLToPath(new URL('./src/rendering.ts', import.meta.url)) },
  { find: '@codexo/exojs/debug', replacement: fileURLToPath(new URL('./src/debug/index.ts', import.meta.url)) },
  { find: '@codexo/exojs', replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url)) },
  { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
] as const;

const shaderPlugin = {
  name: 'shader-text',
  transform(_: unknown, id: string) {
    if (id.endsWith('.vert') || id.endsWith('.frag')) {
      return { code: 'export default ""' };
    }
  },
};

// Per-project browser headedness:
//  - WebGL2 Chromium: new headless. EXOJS_BROWSER_HEADED=1 only for local headed debug.
//  - WebGL2 Firefox:  headless.
//  - WebGPU Chromium: new headless — WebGPU adapter is available via swiftshader.
//  - WebGPU Firefox:  headed — Firefox only exposes a WebGPU adapter in a headed session.
const headed = process.env['EXOJS_BROWSER_HEADED'] === '1';
const webgl2Headless = !headed;

export default defineConfig({
  test: {
    coverage: {
      provider: 'istanbul',
      reporter: ['lcov', 'clover', 'text-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
    },
    projects: [
      // ── Project 1: jsdom — all unit/integration tests ─────────────────
      {
        resolve: { alias: aliasConfig },
        plugins: [shaderPlugin],
        define: { __DEV__: JSON.stringify(true) },
        test: {
          name: 'exojs',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./test/setup-env.vitest.ts'],
          include: ['test/**/*.test.ts'],
          exclude: ['test/rendering/browser/**/*.test.ts'],
          testTimeout: 15_000,
        },
      },

      // ── Project 2: browser-webgl-chromium — WebGL2 via Chromium headless ──
      {
        resolve: { alias: aliasConfig },
        plugins: [shaderPlugin],
        define: { __DEV__: JSON.stringify(true) },
        test: {
          name: 'browser-webgl-chromium',
          globals: true,
          include: ['test/rendering/browser/webgl2-*.test.ts'],
          browser: {
            enabled: true,
            headless: webgl2Headless,
            provider: playwright({
              launchOptions: {
                channel: 'chromium',
                args: ['--enable-webgl', '--use-angle=swiftshader'],
              },
            }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },

      // ── Project 3: browser-webgl-firefox — WebGL2 via Firefox headless ──
      {
        resolve: { alias: aliasConfig },
        plugins: [shaderPlugin],
        define: { __DEV__: JSON.stringify(true) },
        test: {
          name: 'browser-webgl-firefox',
          globals: true,
          include: ['test/rendering/browser/webgl2-*.test.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'firefox' }],
          },
        },
      },

      // ── Project 4: browser-webgpu — WebGPU via Chromium new headless ──
      // New headless Chromium exposes a WebGPU adapter via swiftshader.
      {
        resolve: { alias: aliasConfig },
        plugins: [shaderPlugin],
        define: { __DEV__: JSON.stringify(true) },
        test: {
          name: 'browser-webgpu',
          globals: true,
          include: ['test/rendering/browser/webgpu-*.test.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              launchOptions: {
                channel: 'chromium',
                args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
              },
            }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },

      // ── Project 5: browser-webgpu-firefox — WebGPU via Firefox headed ──
      // Firefox only exposes a WebGPU adapter in a headed session.
      {
        resolve: { alias: aliasConfig },
        plugins: [shaderPlugin],
        define: { __DEV__: JSON.stringify(true) },
        test: {
          name: 'browser-webgpu-firefox',
          globals: true,
          include: ['test/rendering/browser/webgpu-*.test.ts'],
          browser: {
            enabled: true,
            headless: false,
            provider: playwright(),
            instances: [{ browser: 'firefox' }],
          },
        },
      },

      // ── Project 6: browser-webgpu-firefox-dark — same as 5, dark mode ──
      // Emulates a dark-mode OS preference so colour-scheme-sensitive rendering
      // paths are exercised alongside the default light-mode session.
      {
        resolve: { alias: aliasConfig },
        plugins: [shaderPlugin],
        define: { __DEV__: JSON.stringify(true) },
        test: {
          name: 'browser-webgpu-firefox-dark',
          globals: true,
          include: ['test/rendering/browser/webgpu-*.test.ts'],
          browser: {
            enabled: true,
            headless: false,
            provider: playwright(),
            instances: [{ browser: 'firefox', contextOptions: { colorScheme: 'dark' } }],
          },
        },
      },

      // ── Project 7: exojs-particles — unit tests for the particles package ──
      {
        resolve: { alias: aliasConfig },
        plugins: [shaderPlugin],
        define: { __DEV__: JSON.stringify(true) },
        test: {
          name: 'exojs-particles',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./test/setup-env.vitest.ts'],
          include: ['packages/exojs-particles/test/**/*.test.ts'],
          testTimeout: 15_000,
        },
      },

      // ── Project 8: exojs-tiled — unit tests for the tiled package ──
      {
        resolve: { alias: aliasConfig },
        plugins: [shaderPlugin],
        define: { __DEV__: JSON.stringify(true) },
        test: {
          name: 'exojs-tiled',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./test/setup-env.vitest.ts'],
          include: ['packages/exojs-tiled/test/**/*.test.ts'],
          testTimeout: 15_000,
        },
      },
    ],
  },
  benchmark: {
    include: ['test/bench/**/*.bench.ts'],
  },
});
