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

const headed = process.env['EXOJS_BROWSER_HEADED'] === '1';

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
            headless: !headed,
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
      // Not part of verify:release. Run with: pnpm test:browser:webgpu
      // Tests skip gracefully when WebGPU is unavailable.
      // For local headed debugging: EXOJS_BROWSER_HEADED=1 pnpm test:browser:webgpu
      {
        resolve: { alias: aliasConfig },
        plugins: [shaderPlugin],
        test: {
          name: 'browser-webgpu',
          globals: true,
          include: ['test/rendering/browser/webgpu-*.test.ts'],
          browser: {
            enabled: true,
            headless: !headed,
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
