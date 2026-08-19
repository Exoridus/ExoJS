// Bundles a TypeScript entry point into one self-contained JavaScript string,
// and wraps that as a Rollup/Vite plugin keyed on an import query.
//
// Two classes of source execute outside the module graph that loaded them:
// AudioWorklet processors (`*.worklet.ts`) and Web Workers (`*.worker.ts`).
// Both are handed to the platform as source text
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
// any harness that evaluates the source outside a module context, where
// `import`/`export` syntax is a SyntaxError).
//
// The plugin uses only the two hooks (`resolveId`, `load`) that Rollup and
// Vite implement identically, so one implementation serves a production Rollup
// build, a Vite dev server and every Vitest project.
import { dirname, resolve } from 'node:path';

import { buildSync } from 'esbuild';

import type { InlineSourcePlugin, PluginLoadContext } from './pluginTypes.js';

/** Output format of the emitted bundle. */
export type InlineModuleFormat = 'iife' | 'esm' | 'cjs';

export interface BundleInlineModuleOptions {
  /** Absolute path to the module to bundle. */
  entryPoint: string;
  /**
   * Output format; `iife` (the default) is the only one that guarantees no
   * `import`/`export` token survives into the emitted text.
   */
  format?: InlineModuleFormat;
  /** esbuild syntax target. */
  target?: string;
  /**
   * Minify the bundle. Leave off wherever the emitted text should stay
   * readable (dev builds, tests).
   */
  minify?: boolean;
  /** Compile-time constant replacements, as esbuild `define` entries. */
  define?: Record<string, string>;
}

export interface BundleInlineModuleResult {
  /** The bundled source. */
  code: string;
  /**
   * Absolute paths of every file that contributed to the bundle, for
   * watch-mode invalidation.
   */
  inputs: string[];
}

/** Bundles `entryPoint` and its entire import graph into one JavaScript string. */
export function bundleInlineModule({ entryPoint, format = 'iife', target = 'es2022', minify = false, define }: BundleInlineModuleOptions): BundleInlineModuleResult {
  // esbuild writes each contributing file's path into the bundle as a comment,
  // relative to its working directory - which defaults to `process.cwd()`. The
  // emitted string would then differ byte for byte depending on where the build
  // was started from, which is not a property a bundled artifact may have: the
  // same source has to produce the same text for every caller. Anchoring to
  // the entry point's own directory makes those paths a function of the module
  // graph alone.
  const workingDirectory = dirname(entryPoint);

  const result = buildSync({
    entryPoints: [entryPoint],
    absWorkingDir: workingDirectory,
    bundle: true,
    write: false,
    metafile: true,
    format,
    target,
    minify,
    ...(define ? { define } : {}),
  });

  const [artifact] = result.outputFiles;

  // A bundled entry point produces exactly one artifact. More than one means
  // something asked for a side output (a sourcemap, a code split, a copied
  // asset) that cannot be represented as a single inlined string, and silently
  // inlining the first of them would ship a half-module.
  if (artifact === undefined || result.outputFiles.length !== 1) {
    const names = result.outputFiles.map(file => file.path).join(', ');

    throw new Error(`inline-module: expected exactly one output artifact for ${entryPoint}, got ${result.outputFiles.length} (${names}).`);
  }

  // Metafile keys are relative to `absWorkingDir`, not to the process.
  const inputs = Object.keys(result.metafile.inputs).map(input => resolve(workingDirectory, input));

  return { code: artifact.text, inputs };
}

export interface InlineModulePluginOptions extends Omit<BundleInlineModuleOptions, 'entryPoint'> {
  /** Plugin name, as it appears in bundler diagnostics. */
  name: string;
  /** Import suffix that selects this plugin, including the leading `?`. */
  query: string;
}

/**
 * Builds a Rollup/Vite plugin that resolves `import source from './x.ts?<query>'`
 * to the bundled source of `./x.ts` as a default-exported string.
 *
 * Keying on an explicit import query rather than on the filename keeps the
 * transform opt-in: a module that is imported normally is never routed through
 * the bundler, so a `.worklet.ts`/`.worker.ts` file can also be imported as an
 * ordinary module (by a test, say) without this plugin interfering.
 */
export function createInlineModulePlugin(options: InlineModulePluginOptions): InlineSourcePlugin {
  const { name, query, ...bundleOptions } = options;

  return {
    name,
    // Vite-only: run this plugin's hooks before Vite's core resolver and
    // TS pipeline would otherwise claim the `.ts` id themselves. Rollup
    // ignores unknown plugin properties, so it is harmless there.
    enforce: 'pre',
    resolveId(source: string, importer?: string): string | null {
      if (!source.endsWith(query)) return null;

      const entry = source.slice(0, -query.length);
      // An importer id may carry a query of its own; only its path is a
      // directory to resolve against. A hook called without an importer (an
      // entry point, or a harness driving the plugin directly) resolves the
      // specifier against the working directory instead.
      const importerPath = importer === undefined ? undefined : importer.split('?')[0];
      const resolved = importerPath === undefined || importerPath === '' ? resolve(entry) : resolve(dirname(importerPath), entry);

      return `${resolved}${query}`;
    },
    load(this: PluginLoadContext, id: string): string | null {
      if (!id.endsWith(query)) return null;

      const entryPoint = id.slice(0, -query.length);
      const { code, inputs } = bundleInlineModule({ entryPoint, ...bundleOptions });

      // The entry point is the only file Rollup/Vite knows about; every module
      // the bundle pulled in is invisible to them, so an edit to a shared
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
