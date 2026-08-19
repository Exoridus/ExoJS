import type { InlineSourcePlugin } from './pluginTypes.js';
import { createWorkerPlugin } from './workerPlugin.js';
import { createWorkletPlugin } from './workletPlugin.js';

export interface ExojsPluginOptions {
  /**
   * Minify the emitted worklet and worker strings.
   *
   * Off by default, which keeps the inlined source readable in dev servers,
   * tests and stack traces. There is deliberately no automatic production
   * detection: Rollup has no mode of its own, so any inference would make the
   * same config behave differently in the two supported bundlers. Derive it
   * from the surrounding build instead - in Vite, `defineConfig(({ mode }) =>
   * ({ plugins: [exojs({ minify: mode === 'production' })] }))`.
   */
  minify?: boolean;
}

/**
 * The ExoJS build plugins: typed AudioWorklet and Web Worker sources, inlined
 * as strings.
 *
 * Add it to a Vite or Rollup config and `import source from
 * './x.worklet.ts?worklet'` (or `'./x.worker.ts?worker'`) resolves to the
 * bundled source of that module, imports and all, as a default-exported
 * string. Nothing is emitted as a separate asset and nothing is fetched at
 * runtime.
 *
 * Both plugins are inert for a build that never uses their import query, so
 * including both costs nothing.
 */
export function exojs({ minify = false }: ExojsPluginOptions = {}): InlineSourcePlugin[] {
  return [createWorkletPlugin({ minify }), createWorkerPlugin({ minify })];
}
