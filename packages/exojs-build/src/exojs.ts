import type { SourcePlugin } from './pluginTypes.js';
import { createShaderPlugin } from './shaderPlugin.js';
import { createWorkerPlugin } from './workerPlugin.js';
import { createWorkletPlugin } from './workletPlugin.js';

export interface ExojsPluginOptions {
  /**
   * Minify the emitted shader, worklet and worker strings.
   *
   * Off by default, which keeps the inlined source readable in dev servers,
   * tests and stack traces. There is deliberately no automatic production
   * detection: Rollup has no mode of its own, so any inference would make the
   * same config behave differently in the two supported bundlers. Derive it
   * from the surrounding build instead - in Vite, `defineConfig(({ mode }) =>
   * ({ plugins: [exojs({ minify: mode === 'production' })] }))`.
   *
   * For shaders this is comment and whitespace stripping only, never a
   * semantic rewrite; see `createShaderPlugin`.
   */
  minify?: boolean;
}

/**
 * The ExoJS build plugins: shader files, typed AudioWorklet modules and typed
 * Web Worker modules, all inlined as strings.
 *
 * Add it to a Vite or Rollup config and
 *
 *  - `import source from './effect.frag'` (or `.vert`, or `.wgsl`) resolves to
 *    that file's text,
 *  - `import source from './x.worklet.ts?worklet'` (or `'./x.worker.ts?worker'`)
 *    resolves to the bundled source of that module, imports and all,
 *
 * each as a default-exported string. Nothing is emitted as a separate asset
 * and nothing is fetched at runtime.
 *
 * Every plugin is inert for a build that never imports what it claims, so
 * including all three costs nothing. A shader import that carries a query is
 * left to the bundler, so `?raw` and `?url` behave as they would without this
 * preset.
 */
export function exojs({ minify = false }: ExojsPluginOptions = {}): SourcePlugin[] {
  return [createShaderPlugin({ minify }), createWorkletPlugin({ minify }), createWorkerPlugin({ minify })];
}
