// Bundles a TypeScript entry point into one self-contained JavaScript string,
// and wraps that as a Rollup/Vite plugin keyed on an import query.
//
// Two source classes in this repository execute outside the module graph that
// loaded them: AudioWorklet processors (`*.worklet.ts`) and Web Workers
// (`*.worker.ts`). Both are handed to the platform as source text
// (`audioWorklet.addModule(blobUrl)` / `new Worker(blobUrl)`), so neither can
// resolve an `import` at runtime and neither may ship as a separate network
// asset. Authoring them as template-string constants would keep them out of
// every type, lint and test program; bundling them here keeps them ordinary
// TypeScript modules that may import ordinary TypeScript modules, and still
// produces the single string those APIs require.
//
// `format: 'iife'` is what makes the output valid in both shapes the emitted
// text is evaluated in: as a real ES module (`addModule()` always parses
// worklet scripts as modules) and as a plain script (a classic `Worker`, and
// the DSP unit tests, which evaluate the source outside any module context
// where `import`/`export` syntax is a SyntaxError).
//
// The plugin uses only the two hooks (`resolveId`, `load`) that Rollup and
// Vite/Vitest implement identically, so one implementation serves the
// production Rollup build and every Vitest project.
import { dirname, resolve } from 'node:path';

import { buildSync } from 'esbuild';

/**
 * Bundles `entryPoint` and its entire import graph into one JavaScript string.
 *
 * @param {object} options
 * @param {string} options.entryPoint Absolute path to the module to bundle.
 * @param {'iife' | 'esm' | 'cjs'} [options.format] Output format; `iife` (the
 *   default) is the only one that guarantees no `import`/`export` token
 *   survives into the emitted text.
 * @param {string} [options.target] esbuild syntax target.
 * @param {boolean} [options.minify] Minify the bundle. Leave off wherever the
 *   emitted text should stay readable (dev builds, tests).
 * @param {Record<string, string>} [options.define] Compile-time constant
 *   replacements, as esbuild `define` entries.
 * @returns {{ code: string, inputs: string[] }} The bundled source and the
 *   absolute paths of every file that contributed to it (for watch-mode
 *   invalidation).
 */
export function bundleInlineModule({ entryPoint, format = 'iife', target = 'es2022', minify = false, define }) {
  const result = buildSync({
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    metafile: true,
    format,
    target,
    minify,
    ...(define ? { define } : {}),
  });

  // A bundled entry point produces exactly one artifact. More than one means
  // something asked for a side output (a sourcemap, a code split, a copied
  // asset) that cannot be represented as a single inlined string, and silently
  // inlining the first of them would ship a half-module.
  if (result.outputFiles.length !== 1) {
    const names = result.outputFiles.map(file => file.path).join(', ');

    throw new Error(`inline-module: expected exactly one output artifact for ${entryPoint}, got ${result.outputFiles.length} (${names}).`);
  }

  const inputs = Object.keys(result.metafile.inputs).map(input => resolve(input));

  return { code: result.outputFiles[0].text, inputs };
}

/**
 * Builds a Rollup/Vite plugin that resolves `import source from './x.ts?<query>'`
 * to the bundled source of `./x.ts` as a default-exported string.
 *
 * Keying on an explicit import query rather than on the filename keeps the
 * transform opt-in: a module that is imported normally is never routed through
 * the bundler, so a `.worklet.ts`/`.worker.ts` file can also be imported as an
 * ordinary module (by a test, say) without this plugin interfering.
 *
 * @param {object} options
 * @param {string} options.name Plugin name.
 * @param {string} options.query Import suffix that selects this plugin,
 *   including the leading `?`.
 * @param {'iife' | 'esm' | 'cjs'} [options.format]
 * @param {string} [options.target]
 * @param {boolean} [options.minify]
 * @param {Record<string, string>} [options.define]
 * @returns {import('rollup').Plugin}
 */
export function createInlineModulePlugin({ name, query, format, target, minify, define }) {
  return {
    name,
    // Vite-only: run this plugin's hooks before Vite's core resolver and
    // TS pipeline would otherwise claim the `.ts` id themselves. Rollup
    // ignores unknown plugin properties, so it is harmless there.
    enforce: 'pre',
    resolveId(source, importer) {
      if (!source.endsWith(query)) return null;

      const target_ = source.slice(0, -query.length);
      const importerPath = importer ? importer.split('?')[0] : undefined;
      const resolved = importerPath ? resolve(dirname(importerPath), target_) : resolve(target_);

      return `${resolved}${query}`;
    },
    load(id) {
      if (!id.endsWith(query)) return null;

      const entryPoint = id.slice(0, -query.length);
      const { code, inputs } = bundleInlineModule({ entryPoint, format, target, minify, define });

      // The entry point is the only file Rollup/Vite knows about; every module
      // the bundle pulled in is invisible to them, so an edit to a shared DSP
      // helper would not invalidate this module without registering it here.
      if (typeof this.addWatchFile === 'function') {
        for (const input of inputs) {
          this.addWatchFile(input);
        }
      }

      return `export default ${JSON.stringify(code)};`;
    },
  };
}
