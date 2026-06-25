/**
 * Source-accurate node/tsx entrypoint for the perf-bench scripts.
 *
 * Use via `node --conditions=@codexo/source --import ./scripts/glsl-register.mjs
 * --import tsx/esm <script>`. It does the two things a plain node/tsx run lacks
 * to evaluate the engine source (rather than the last `dist` build):
 *
 *  1. Registers the GLSL loader hook (`glsl-loader.mjs`) so `.vert`/`.frag`
 *     imports resolve to their source text.
 *  2. Installs the build-time constants (`__DEV__`/`__VERSION__`/`__REVISION__`)
 *     as real globals. The engine references the bare `__DEV__` (e.g. `src/core/
 *     dev.ts`); rollup replaces it at build time and vitest's `define` + the
 *     `_setup-dev-global` setup file inject it for tests — under plain node it is
 *     undefined and any guarded code path throws `__DEV__ is not defined`.
 */
import { register } from 'node:module';

globalThis.__DEV__ = true;
globalThis.__VERSION__ = '0.0.0';
globalThis.__REVISION__ = 'source';

register('./glsl-loader.mjs', import.meta.url);
