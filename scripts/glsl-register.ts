/**
 * Source-accurate node/tsx entrypoint for the perf-bench scripts.
 *
 * Use via `node --conditions=@codexo/exojs-source --import ./scripts/glsl-register.ts
 * --import tsx/esm <script>`. It does the two things a plain node/tsx run lacks
 * to evaluate the engine source (rather than the last `dist` build):
 *
 *  1. Registers the GLSL loader hook (`glsl-loader.ts`) so `.vert`/`.frag`
 *     imports resolve to their source text.
 *  2. Installs the build-time constants (`__DEV__`/`__VERSION__`/`__REVISION__`)
 *     as real globals. The engine references the bare `__DEV__` (e.g. `src/core/
 *     dev.ts`); rollup replaces it at build time and vitest's `define` + the
 *     `_setup-dev-global` setup file inject it for tests - under plain node it is
 *     undefined and any guarded code path throws `__DEV__ is not defined`.
 *
 * Both this file and the hook it registers are TypeScript that node itself
 * strips: a `--import` module is loaded outside the hook chain, so `tsx/esm`
 * never sees it no matter which side of it the flag sits on. Keep the syntax
 * erasable (no enums, no parameter properties) - there is no compiler here.
 */
import { register } from 'node:module';

// Assigned through the global object rather than declared ambiently: a
// `declare global` here would leak these names into every other file of the
// tooling type-check program, where they are not defined.
Object.assign(globalThis, {
  __DEV__: true,
  __VERSION__: '0.0.0',
  __REVISION__: 'source',
});

register('./glsl-loader.ts', import.meta.url);
