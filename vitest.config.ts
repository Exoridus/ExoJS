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
          include: ['test/rendering/browser/**/*.test.ts'],
          browser: {
            enabled: true,
            provider: playwright({
              launchOptions: {
                args: ['--enable-webgl', '--use-angle=swiftshader'],
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
