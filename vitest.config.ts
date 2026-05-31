import { fileURLToPath } from 'node:url';

import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const aliasConfig = { '@': fileURLToPath(new URL('./src', import.meta.url)) };

const shaderPlugin = {
  name: 'shader-text',
  transform(_: unknown, id: string) {
    if (id.endsWith('.vert') || id.endsWith('.frag')) {
      return { code: 'export default ""' };
    }
  },
};

// Per-project browser headedness defaults:
//  - WebGL2 Chromium: headless by default. EXOJS_BROWSER_HEADED=1 for headed debug.
//  - WebGL2 Firefox:  headless by default (headless passes 49/49).
//  - WebGPU Chromium: headless by default (gracefully skips when no adapter).
//  - WebGPU Chromium headed: separate project for opt-in debug.
//  - WebGPU Firefox:  headed by default (experimental lane; headless has no adapter).
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
        test: {
          name: 'browser-webgl-chromium',
          globals: true,
          include: ['test/rendering/browser/webgl2-*.test.ts'],
          browser: {
            enabled: true,
            headless: webgl2Headless,
            provider: playwright({
              launchOptions: {
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

      // ── Project 4: browser-webgpu-chromium — WebGPU via Chromium headless ──
      // Gracefully skips when no WebGPU adapter is available (headless Chromium).
      // Use browser-webgpu-chromium-headed for full WebGPU test runs.
      {
        resolve: { alias: aliasConfig },
        plugins: [shaderPlugin],
        test: {
          name: 'browser-webgpu-chromium',
          globals: true,
          include: ['test/rendering/browser/webgpu-*.test.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              launchOptions: {
                args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
              },
            }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },

      // ── Project 5: browser-webgpu-chromium-headed — WebGPU via Chromium headed ──
      // Opt-in debug fallback. Headless Chromium has no WebGPU adapter; this
      // project runs with a visible browser so the adapter is available.
      {
        resolve: { alias: aliasConfig },
        plugins: [shaderPlugin],
        test: {
          name: 'browser-webgpu-chromium-headed',
          globals: true,
          include: ['test/rendering/browser/webgpu-*.test.ts'],
          browser: {
            enabled: true,
            headless: false,
            provider: playwright({
              launchOptions: {
                args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
              },
            }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },

      // ── Project 6: browser-webgpu-firefox — WebGPU via Firefox (experimental) ──
      // Headed by default (headless Firefox has no WebGPU adapter).
      // Not part of test:browser; run explicitly with test:browser:webgpu:firefox.
      {
        resolve: { alias: aliasConfig },
        plugins: [shaderPlugin],
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
    ],
  },
  benchmark: {
    include: ['test/bench/**/*.bench.ts'],
  },
});
