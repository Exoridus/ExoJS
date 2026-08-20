// Shared Vitest building blocks for the ExoJS monorepo. The browser (WebGL2/
// WebGPU) projects stay repository-local because they need repo path knowledge
// and the playwright provider; this module centralizes the parts every project
// shares: the package source conditions, the shader-stub plugin, the `?worklet`
// and `?worker` inline-source plugins, and a jsdom unit-test project factory.
import { createShaderPlugin, createWorkerPlugin, createWorkletPlugin } from '@codexo/exojs-build';

/**
 * Conditions that activate each package's package-private `@codexo/...-source`
 * imports condition so `#*` resolves to ./src during tests, plus the standard
 * conditions that keep normal dependency resolution intact (browser-first).
 */
export const srcConditions = ['@codexo/exojs-source', '@codexo/exojs-particles-source', 'module', 'browser', 'import', 'default'];

/**
 * Transpiles `*.worklet.ts?worklet` imports to a real, functioning JS string
 * (mirroring the production Rollup build - see `../rollup/index.js`) instead
 * of stubbing them: unlike GLSL, worklet source is actually executed by tests
 * (DSP-level `eval()` harnesses and the real-Web-Audio browser suite), so a
 * stub would defeat the point. Shared across every jsdom test project via
 * `createJsdomTestProject` below, and wired directly into the repo-root
 * browser projects (`vitest.config.ts`) since those are not built from this
 * factory.
 */
export const workletTransformPlugin = createWorkletPlugin();

/**
 * The `?worker` counterpart. Worker sources are executed for real by the browser
 * lanes (jsdom implements neither `Worker` nor `URL.createObjectURL`), so this
 * has to be the production transform rather than a stub. Wired the same two
 * ways as `workletTransformPlugin`.
 */
export const workerTransformPlugin = createWorkerPlugin();

/**
 * A jsdom unit/integration test project. Used for Core and each extension.
 *
 * `execArgv` passes `--expose-gc` to the worker so specs that assert weak-retention
 * behaviour (`WeakRef`/`FinalizationRegistry` reclamation) can force a real major
 * GC instead of self-skipping on a missing `globalThis.gc`. The flag only exposes
 * the function; it does not otherwise change how V8 collects. Note this is a
 * top-level test option in Vitest 4 - under `poolOptions.forks` it is silently
 * ignored.
 * @param {{ name: string, include: string[], exclude?: string[], setupFiles?: string[], alias?: unknown }} opts
 */
export function createJsdomTestProject(opts) {
  const { name, include, exclude, setupFiles = ['./test/setup-env.vitest.ts'], alias } = opts;
  return {
    resolve: { alias, conditions: srcConditions },
    ssr: { resolve: { conditions: srcConditions } },
    plugins: [createShaderPlugin(), workletTransformPlugin, workerTransformPlugin],
    define: { __DEV__: JSON.stringify(true), __VERSION__: JSON.stringify('0.0.0'), __REVISION__: JSON.stringify('test') },
    test: {
      name,
      environment: 'jsdom',
      globals: true,
      setupFiles,
      include,
      ...(exclude ? { exclude } : {}),
      testTimeout: 15_000,
      execArgv: ['--expose-gc'],
    },
  };
}
