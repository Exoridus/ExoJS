// Rollup/Vite plugin that turns a real, typed `*.worker.ts` module into an
// inlined JS-string import, the Web Worker counterpart to
// `./worklet-plugin.js`. Both share the bundling primitive in
// `./inline-module.js`.
//
// Selected by an explicit `?worker` import query - e.g.
// `import src from './x.worker.ts?worker'`. The emitted string is handed to a
// classic `Worker` through a Blob URL, which is why the bundle is an IIFE and
// not an ES module: `new Worker(url)` without `{ type: 'module' }` parses its
// script as a classic script, where an `import` statement is a SyntaxError.
// A module worker would also be a deployment regression - Safari only gained
// support in 15 - and nothing in the emitted source needs one.
import { createInlineModulePlugin } from './inline-module.js';

/**
 * @param {{ minify?: boolean }} [options] `minify` additionally passes
 *   esbuild's `minify: true`; leave it off wherever the emitted worker string
 *   should stay readable (dev builds, tests).
 * @returns {import('rollup').Plugin}
 */
export function createWorkerPlugin({ minify = false } = {}) {
  return createInlineModulePlugin({
    name: 'exojs-worker-transform',
    query: '?worker',
    format: 'iife',
    target: 'es2022',
    minify,
  });
}
