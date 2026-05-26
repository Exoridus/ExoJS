import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    {
      name: 'shader-text',
      transform(_, id) {
        if (id.endsWith('.vert') || id.endsWith('.frag')) {
          return { code: 'export default ""' };
        }
      },
    },
  ],
  test: {
    name: 'exojs',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup-env.vitest.ts'],
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'clover', 'text-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
    },
  },
});
