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
//  - WebGL2 (`browser`): headless by default; EXOJS_BROWSER_HEADED=1 opts into a
//    visible browser for local debugging.
//  - WebGPU (`browser-webgpu`): headed by default, because headless Chromium
//    exposes no WebGPU adapter in this environment (phase 12 finding). The
//    capability-smoke alias forces headless from the CLI via `--browser.headless`,
//    which overrides this default; tests then skip gracefully (no adapter).
const headed = process.env['EXOJS_BROWSER_HEADED'] === '1';
const webgl2Headless = !headed; // headless unless explicitly opted into headed
const webgpuHeadless = false; // headed by default; `--browser.headless` overrides

export default defineConfig({
  test: {
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
          coverage: {
            provider: 'istanbul',
            reporter: ['lcov', 'clover', 'text-summary'],
            include: ['src/**/*.ts'],
            exclude: ['src/**/*.d.ts'],
          },
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

      // ── Project 3: browser-webgpu — opt-in WebGPU via Playwright/Chromium ──
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
