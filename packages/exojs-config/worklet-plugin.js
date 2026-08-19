// Rollup/Vite plugin that turns a real, typed `*.worklet.ts` module into an
// inlined JS-string import — the AudioWorklet analogue of the GLSL
// `*.vert`/`*.frag` → string mechanism in `./shader-plugin.js`. Shader sources
// are already plain text, so that plugin only inlines raw file contents;
// AudioWorklet code is TypeScript and may import ordinary modules, so this one
// bundles it first (see `./inline-module.js` for the shared primitive and why
// the output has to be an IIFE).
//
// Selected by an explicit `?worklet` import query — e.g.
// `import src from './x.worklet.ts?worklet'` — not by the filename, so a
// worklet module can still be imported normally where that is wanted.
import { createInlineModulePlugin } from './inline-module.js';

/**
 * @param {{ minify?: boolean }} [options] `minify` additionally passes
 *   esbuild's `minify: true`; leave it off wherever the emitted worklet string
 *   should stay readable (the unminified module tree, dev builds, tests - see
 *   `rollup.config.ts`, which mirrors the shader plugin's minified/plain
 *   instance split).
 * @returns {import('rollup').Plugin}
 */
export function createWorkletPlugin({ minify = false } = {}) {
  return createInlineModulePlugin({
    name: 'exojs-worklet-transform',
    query: '?worklet',
    format: 'iife',
    target: 'es2022',
    minify,
  });
}
