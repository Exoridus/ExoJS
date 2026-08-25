// Rollup/Vite plugin that turns a real, typed `*.worklet.ts` module into an
// inlined JS-string import.
//
// Selected by an explicit `?worklet` import query - e.g.
// `import source from './x.worklet.ts?worklet'`. The emitted string is handed
// to `audioWorklet.addModule()` through a Blob URL, which parses it as a module
// in a realm that has no bundler, so no `import` may survive into it (see
// `./inlineModule.ts` for the shared primitive and why the output is an IIFE).
//
// Keying on the query rather than on the filename keeps the transform opt-in,
// so a worklet module can still be imported normally where that is wanted.
import { createInlineModulePlugin } from './inlineModule.js';
import type { InlineSourcePlugin } from './pluginTypes.js';

export interface WorkletPluginOptions {
  /**
   * Minify the emitted worklet source. Leave it off wherever the string should
   * stay readable (dev builds, tests).
   */
  minify?: boolean;
}

/** Inlines `*.worklet.ts?worklet` imports as bundled AudioWorklet source strings. */
export const createWorkletPlugin = ({ minify = false }: WorkletPluginOptions = {}): InlineSourcePlugin =>
  createInlineModulePlugin({
    name: 'exojs-worklet-transform',
    query: '?worklet',
    format: 'iife',
    target: 'es2022',
    minify,
  });
