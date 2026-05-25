import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Pilot-Konfiguration: 16 repräsentative Suites aus Math, Core, Rendering, Resources.
// Jest bleibt der primäre Test-Runner — dieser Config-Slot ist experimentell.
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
    name: 'pilot',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup-env.vitest.ts'],
    include: [
      // Math (7)
      'test/math/circle.test.ts',
      'test/math/ellipse.test.ts',
      'test/math/matrix.test.ts',
      'test/math/observable-vector.test.ts',
      'test/math/polygon.test.ts',
      'test/math/swept-collision.test.ts',
      'test/math/triangulate.test.ts',
      // Core (3)
      'test/core/capabilities.test.ts',
      'test/core/signal.test.ts',
      'test/core/timer.test.ts',
      // Rendering (5)
      'test/rendering/data-texture.test.ts',
      'test/rendering/drawable.test.ts',
      'test/rendering/graphics.test.ts',
      'test/rendering/view.test.ts',
      'test/rendering/view-follow-scenenode.test.ts',
      // Resources (1)
      'test/resources/asset-manifest.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
    },
  },
});
