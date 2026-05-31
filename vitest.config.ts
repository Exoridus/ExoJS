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
//  - Chromium WebGL2 (`browser`): headless by default; EXOJS_BROWSER_HEADED=1
//    or --browser.headless=false for a visible browser.
//  - Firefox WebGL2 (`browser-webgl-firefox`): headed by default (headless
//    Firefox WebGL2 works but headed is the Firefox default lane).
//  - All WebGPU lanes: headed by default, because headless mode exposes no
//    WebGPU adapter in either browser. The capability-smoke alias (`:headless`)
//    forces headless; tests skip gracefully (no adapter).
const headed = process.env['EXOJS_BROWSER_HEADED'] === '1';
const webgl2Headless = !headed; // Chromium WebGL2: headless unless opted in
const webgpuHeadless = false; // all WebGPU: headed by default; --browser.headless overrides

export default defineConfig({
  test: {
    // Coverage is a root-only option in Vitest's multi-project setup; a
    // `coverage` block inside a project config is silently ignored, which
    // would fall back to the default v8 provider. Keep it here.
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

      // ── Project 2: browser — real WebGL2 via Playwright/Chromium ──────
      {
        resolve: { alias: aliasConfig },
        plugins: [shaderPlugin],
        test: {
          name: 'browser',
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

      // ── Project 3: browser-webgl-firefox — WebGL2 via Playwright/Firefox ──
      // Headed by default (Firefox default lane). Run with: pnpm test:browser:webgl:firefox.
      // Headless variant: pnpm test:browser:webgl:firefox:headless.
      {
        resolve: { alias: aliasConfig },
        plugins: [shaderPlugin],
        test: {
          name: 'browser-webgl-firefox',
          globals: true,
          include: ['test/rendering/browser/webgl2-*.test.ts'],
          browser: {
            enabled: true,
            headless: webgpuHeadless,
            provider: playwright(),
            instances: [{ browser: 'firefox' }],
          },
        },
      },

      // ── Project 4: browser-webgpu-firefox — WebGPU via Playwright/Firefox ──
      // Headed by default (headless Firefox exposes no WebGPU adapter).
      // Run with: pnpm test:browser:webgpu:firefox.
      // Headless smoke: pnpm test:browser:webgpu:firefox:headless.
      // Tests skip gracefully when WebGPU is unavailable.
      {
        resolve: { alias: aliasConfig },
        plugins: [shaderPlugin],
        test: {
          name: 'browser-webgpu-firefox',
          globals: true,
          include: ['test/rendering/browser/webgpu-*.test.ts'],
          browser: {
            enabled: true,
            headless: webgpuHeadless,
            provider: playwright(),
            instances: [{ browser: 'firefox' }],
          },
        },
      },

      // ── Project 5: browser-webgpu — opt-in WebGPU via Playwright/Chromium ──
      // Not part of verify:release. Run with: pnpm test:browser:webgpu (headed).
      // Headed by default: headless Chromium exposes no WebGPU adapter here.
      // Capability smoke (headless): pnpm test:browser:webgpu:headless.
      // Tests skip gracefully when WebGPU is unavailable.
      {
        resolve: { alias: aliasConfig },
        plugins: [shaderPlugin],
        test: {
          name: 'browser-webgpu',
          globals: true,
          include: ['test/rendering/browser/webgpu-*.test.ts'],
          browser: {
            enabled: true,
            headless: webgpuHeadless,
            provider: playwright({
              launchOptions: {
                // --enable-unsafe-webgpu: enable Dawn/WebGPU in Chromium
                // --ignore-gpu-blocklist: allow software/virtual GPU adapters
                // On Linux CI, add --use-vulkan=swiftshader if no hardware GPU
                args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
              },
            }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
  benchmark: {
    include: ['test/bench/**/*.bench.ts'],
  },
});
