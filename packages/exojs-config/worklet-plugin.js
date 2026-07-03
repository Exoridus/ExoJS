// Shared Rollup/Vite plugin that turns a real, typed `*.worklet.ts` module
// into an inlined JS-string import — the AudioWorklet analogue of the GLSL
// `*.vert`/`*.frag` → string mechanism (see `rollup/index.js`'s `string({
// include: ['**/*.vert', '**/*.frag'] })` and `vitest/index.js`'s
// `shaderStubPlugin`). GLSL sources are already plain text, so that mechanism
// only needs to inline raw file contents; AudioWorklet code is authored as
// TypeScript, so this plugin additionally transpiles it (via esbuild) before
// inlining.
//
// Adoption is incremental and opt-in via an explicit `?worklet` import query
// — e.g. `import src from './x.worklet.ts?worklet'` — rather than by matching
// the `.worklet.ts` filename itself. Worklet files that are not yet converted
// keep exporting a plain template-string constant and are imported without
// the query, so they never reach this plugin and are completely unaffected
// by its presence.
//
// AudioWorklet code runs in its own global scope (no bundler, no runtime
// imports — `registerAudioWorkletProcessor` loads it via a Blob URL passed to
// `audioWorklet.addModule()`), so the source must be self-contained. Transpiling
// with esbuild's `iife` format guarantees the emitted string contains no
// `import`/`export` tokens, which keeps it valid in BOTH runtime shapes the
// codebase evaluates worklet source in: as a real ES module (`addModule()`
// always parses worklet scripts as modules) and as a plain script (the
// DSP-level unit tests `eval()` the source directly outside any module context,
// where `import`/`export` syntax would throw a SyntaxError).
//
// Implemented with only the two hooks (`resolveId`, `load`) that Rollup and
// Vite/Vitest plugins share identically, so one implementation serves all
// three build/test contexts: the production Rollup build (via
// `createExtensionConfig` in `rollup/index.js`), and Vitest — both the shared
// jsdom project factory (`createJsdomTestProject`) and the repo-root browser
// projects, which wire it in directly since they are not built from that
// factory.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { transformSync } from 'esbuild';

const WORKLET_QUERY = '?worklet';

/**
 * @returns {import('rollup').Plugin}
 */
export function createWorkletPlugin() {
  return {
    name: 'exojs-worklet-transform',
    // Vite-only: makes sure this plugin's `resolveId`/`load` run before Vite's
    // core resolver/esbuild-TS pipeline would otherwise try to handle the
    // `.ts` id itself. Rollup ignores unknown plugin properties, so this is
    // harmless there.
    enforce: 'pre',
    resolveId(source, importer) {
      if (!source.endsWith(WORKLET_QUERY)) return null;
      const target = source.slice(0, -WORKLET_QUERY.length);
      const importerPath = importer ? importer.split('?')[0] : undefined;
      const resolved = importerPath ? resolve(dirname(importerPath), target) : resolve(target);
      return `${resolved}${WORKLET_QUERY}`;
    },
    load(id) {
      if (!id.endsWith(WORKLET_QUERY)) return null;
      const filePath = id.slice(0, -WORKLET_QUERY.length);
      const source = readFileSync(filePath, 'utf8');
      const { code } = transformSync(source, {
        loader: 'ts',
        format: 'iife',
        target: 'es2022',
        sourcefile: filePath,
      });
      return `export default ${JSON.stringify(code)};`;
    },
  };
}
