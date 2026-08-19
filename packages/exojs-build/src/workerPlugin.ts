// Rollup/Vite plugin that turns a real, typed `*.worker.ts` module into an
// inlined JS-string import, the Web Worker counterpart to
// `./workletPlugin.ts`. Both share the bundling primitive in
// `./inlineModule.ts`.
//
// Selected by an explicit `?worker` import query - e.g.
// `import source from './x.worker.ts?worker'`. The emitted string is meant for
// a classic `Worker` created from a Blob URL, which is why the bundle is an
// IIFE and not an ES module: `new Worker(url)` without `{ type: 'module' }`
// parses its script as a classic script, where an `import` statement is a
// SyntaxError. Emitting classic-compatible source keeps the choice with the
// consumer - a classic worker still works, a module worker also accepts it.
import { createInlineModulePlugin } from './inlineModule.js';
import type { InlineSourcePlugin } from './pluginTypes.js';

export interface WorkerPluginOptions {
  /**
   * Minify the emitted worker source. Leave it off wherever the string should
   * stay readable (dev builds, tests).
   */
  minify?: boolean;
}

/** Inlines `*.worker.ts?worker` imports as bundled Web Worker source strings. */
export function createWorkerPlugin({ minify = false }: WorkerPluginOptions = {}): InlineSourcePlugin {
  return createInlineModulePlugin({
    name: 'exojs-worker-transform',
    query: '?worker',
    format: 'iife',
    target: 'es2022',
    minify,
  });
}
