// Shared Vitest building blocks for the ExoJS monorepo. The browser (WebGL2/
// WebGPU) projects stay repository-local because they need repo path knowledge
// and the playwright provider; this module centralizes the parts every project
// shares: the package source conditions, the `?worklet` and `?worker`
// inline-source plugins, and a jsdom unit-test project factory.
import { createWorkerPlugin, createWorkletPlugin } from '@codexo/exojs-build';

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
 * stub would defeat the point. Installed once at the top of the repo-root
 * `vitest.config.ts`, which every project inherits.
 */
export const workletTransformPlugin = createWorkletPlugin();

/**
 * The `?worker` counterpart. Worker sources are executed for real by the browser
 * lanes (jsdom implements neither `Worker` nor `URL.createObjectURL`), so this
 * has to be the production transform rather than a stub. Installed the same way
 * as `workletTransformPlugin`.
 */
export const workerTransformPlugin = createWorkerPlugin();

/**
 * A jsdom unit/integration test project. Used for Core and each extension.
 *
 * The project carries test options only. Aliases, source conditions, the
 * shader/worklet/worker transforms and the build defines are declared once at
 * the top of the declaring config, which every such project inherits: a project
 * that sets any Vite-level option gets a Vite server of its own, so repeating
 * them per project made every project re-transform the engine sources.
 *
 * `execArgv` passes `--expose-gc` to the worker so specs that assert weak-retention
 * behaviour (`WeakRef`/`FinalizationRegistry` reclamation) can force a real major
 * GC instead of self-skipping on a missing `globalThis.gc`. The flag only exposes
 * the function; it does not otherwise change how V8 collects. It is a top-level
 * test option: under `poolOptions.forks` it is silently ignored.
 * @param {{ name: string, include: string[], exclude?: string[], setupFiles?: string[] }} opts
 */
export function createJsdomTestProject(opts) {
  const { name, include, exclude, setupFiles = ['./test/setup-env.vitest.ts'] } = opts;
  return {
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
