import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/scripts/pixelfx-transitions*.test.ts'],
  },
});
