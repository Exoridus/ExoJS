// Shared Vitest building blocks for the ExoJS monorepo. The browser (WebGL2/
// WebGPU) projects stay repository-local because they need repo path knowledge
// and the playwright provider; this module centralizes the parts every project
// shares: the package source conditions, the shader-stub plugin, the AudioWorklet
// `?worklet` transform plugin, and a jsdom unit-test project factory.
import { createWorkletPlugin } from '../worklet-plugin.js';

/**
 * Conditions that activate each package's package-private `@codexo/…-source`
 * imports condition so `#*` resolves to ./src during tests, plus the standard
 * conditions that keep normal dependency resolution intact (browser-first).
 */
export const srcConditions = ['@codexo/source', '@codexo/exojs-particles-source', 'module', 'browser', 'import', 'default'];

/** Stubs `.vert`/`.frag` shader imports to an empty string in unit tests. */
export const shaderStubPlugin = {
  name: 'exojs-shader-stub',
  transform(_code, id) {
    if (id.endsWith('.vert') || id.endsWith('.frag')) {
      return { code: 'export default ""' };
    }
  },
};

/**
 * Transpiles `*.worklet.ts?worklet` imports to a real, functioning JS string
 * (mirroring the production Rollup build — see `../rollup/index.js`) instead
 * of stubbing them: unlike GLSL, worklet source is actually executed by tests
 * (DSP-level `eval()` harnesses and the real-Web-Audio browser suite), so a
 * stub would defeat the point. Shared across every jsdom test project via
 * `createJsdomTestProject` below, and wired directly into the repo-root
 * browser projects (`vitest.config.ts`) since those are not built from this
 * factory.
 */
export const workletTransformPlugin = createWorkletPlugin();

/**
 * A jsdom unit/integration test project. Used for Core and each extension.
 * @param {{ name: string, include: string[], exclude?: string[], setupFiles?: string[], alias?: unknown }} opts
 */
export function createJsdomTestProject(opts) {
  const { name, include, exclude, setupFiles = ['./test/setup-env.vitest.ts'], alias } = opts;
  return {
    resolve: { alias, conditions: srcConditions },
    ssr: { resolve: { conditions: srcConditions } },
    plugins: [shaderStubPlugin, workletTransformPlugin],
    define: { __DEV__: JSON.stringify(true), __VERSION__: JSON.stringify('0.0.0'), __REVISION__: JSON.stringify('test') },
    test: {
      name,
      environment: 'jsdom',
      globals: true,
      setupFiles,
      include,
      ...(exclude ? { exclude } : {}),
      testTimeout: 15_000,
    },
  };
}
