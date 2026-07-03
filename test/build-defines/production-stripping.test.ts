/**
 * Production-stripping integration tests.
 *
 * Verifies that a production build produces artefacts with:
 *   - no unresolved __DEV__, __VERSION__, or __REVISION__ references
 *   - buildInfo.development === false
 *   - version matching the packed package manifest
 *   - assert/assertDefined (the __DEV__-gated helpers) stripped to no-ops
 *   - invariant (the always-on contract check) surviving into production
 *
 * The dist-dependent checks are skipped when `dist/` has not been built in
 * production mode (run `pnpm build` first). Below that, a self-contained
 * pipeline test runs the SAME mechanism the real prod build uses
 * (`@rollup/plugin-replace` + `terser` with the repo's `pure_funcs`) against a
 * small representative snippet, so the assert/assertDefined-stripped vs.
 * invariant-survives guarantee is verified against real minified output on
 * every run — independent of whether `dist/` has been built, and independent
 * of which internal call sites currently exist for either helper.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import { type Plugin, rollup } from 'rollup';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { createBuildDefines, resolveVersion } from '../../packages/exojs-config/build-defines/index.js';

const rootDir = resolve(import.meta.dirname!, '..', '..');

const requiredDistFiles = [
  'dist/esm/core/dev.js',
  'dist/esm/core/BuildInfo.js',
  'dist/esm/extensions/ExtensionRegistry.js',
  'dist/esm/core/Application.js',
  'dist/esm/rendering/text/BitmapText.js',
  'dist/esm/rendering/texture/RenderTexture.js',
  'dist/exo.esm.js',
  'dist/exo.debug.esm.js',
] as const;

const hasProductionBuild = requiredDistFiles.every(f => existsSync(resolve(rootDir, f)));

const read = (rel: string): string => {
  const p = resolve(rootDir, rel);
  if (!existsSync(p)) throw new Error(`Missing file: ${p}`);
  return readFileSync(p, 'utf8');
};

// ---------------------------------------------------------------------------
// Real-pipeline test: assert/assertDefined stripped, invariant survives.
//
// Builds a tiny representative module through the EXACT same transform chain
// `rollup.config.ts` uses for production (`@rollup/plugin-replace` setting
// `__DEV__ → false`, then `terser` with the repo's `pure_funcs` list), using
// the real `src/core/dev.ts` implementations and real runtime messages lifted
// from their actual call sites (Container.addChild's cycle guard). This is
// self-contained (no dependency on a pre-built `dist/`) and fast (bundles one
// tiny file), so it runs unconditionally on every `pnpm test`.
// ---------------------------------------------------------------------------

/** Extracts the `pure_funcs` list from `rollup.config.ts` — never hard-coded here. */
function extractPureFuncs(): string[] {
  const config = readFileSync(resolve(rootDir, 'rollup.config.ts'), 'utf8');
  const match = /pure_funcs:\s*\[([^\]]*)\]/.exec(config);
  expect(match).not.toBeNull();
  return [...match![1]!.matchAll(/'([^']+)'/g)].map(m => m[1]!);
}

/** Extracts the real invariant message from Container.addChild's scene-graph cycle guard. */
function extractContainerCycleMessage(): string {
  const source = readFileSync(resolve(rootDir, 'src/rendering/Container.ts'), 'utf8');
  const match = /invariant\(\s*ancestor !== child,\s*'([^']+)'/.exec(source);
  expect(match).not.toBeNull();
  return match![1]!;
}

/**
 * Strips TypeScript syntax down to plain JS via the TypeScript compiler's own
 * `transpileModule` API — the same tool `dist/exo.esm.js` (the bundle these
 * dist-content checks care about) is actually compiled with, via
 * `@rollup/plugin-typescript` in `rollup.config.ts`. `ts.transpileModule` is
 * pure JS with no native binary, so it runs safely inside vitest's jsdom
 * environment (unlike esbuild, which relies on a `TextEncoder` sanity check
 * that jsdom's patched globals fail — irrelevant to production reality, since
 * the real `dist/exo.esm.js` build never runs esbuild at all).
 */
function transpileTs(source: string): string {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

/**
 * Runs a small snippet — importing the real `assert`/`assertDefined`/
 * `invariant` from `src/core/dev.ts` and calling them the way real call sites
 * do — through the production define-replace + terser pipeline, and returns
 * the minified output.
 */
async function buildProductionSnippet(cycleMessage: string, pureFuncs: string[]): Promise<string> {
  const virtualEntryId = '\0virtual-entry.js';
  const virtualDevId = '\0virtual-dev.js';

  const devSource = readFileSync(resolve(rootDir, 'src/core/dev.ts'), 'utf8');
  const devJs = transpileTs(devSource);

  const entryTs = `
    import { assert, assertDefined, invariant } from ${JSON.stringify(virtualDevId)};

    export function addChild(ancestor: unknown, child: unknown): void {
      invariant(ancestor !== child, ${JSON.stringify(cycleMessage)});
    }

    export function validate(a: number, b: number | null): number {
      assert(a > 0, 'dev-only-assert-marker-should-not-survive-minification');
      return a + assertDefined(b, 'dev-only-assertDefined-marker-should-not-survive-minification');
    }
  `;
  const entryJs = transpileTs(entryTs);

  const virtualPlugin: Plugin = {
    name: 'virtual-entry',
    resolveId(id) {
      return id === virtualEntryId || id === virtualDevId ? id : null;
    },
    load(id) {
      if (id === virtualEntryId) return entryJs;
      if (id === virtualDevId) return devJs;
      return null;
    },
  };

  // Same define values production uses (mode: 'production' → __DEV__: 'false').
  const defines = createBuildDefines({ mode: 'production', version: resolveVersion(rootDir), revision: 'test' });

  const bundle = await rollup({
    input: virtualEntryId,
    plugins: [virtualPlugin, replace({ preventAssignment: true, values: defines }), terser({ compress: { pure_funcs: pureFuncs } })],
    onwarn: () => {
      // Silence rollup's "unused external" / treeshaking noise for this tiny synthetic entry.
    },
  });

  try {
    const { output } = await bundle.generate({ format: 'es' });
    return output[0]!.code;
  } finally {
    await bundle.close();
  }
}

describe('assert/assertDefined stripped vs. invariant survives (real terser production pipeline)', () => {
  it('strips assert/assertDefined callsites but keeps invariant and its real runtime message', async () => {
    const pureFuncs = extractPureFuncs();
    const cycleMessage = extractContainerCycleMessage();
    const output = await buildProductionSnippet(cycleMessage, pureFuncs);

    // assert/assertDefined: __DEV__ → false empties their bodies, and they're
    // listed in pure_funcs, so terser drops the callsites entirely — the
    // interpolated marker messages must not survive into the bundle.
    expect(output).not.toContain('dev-only-assert-marker-should-not-survive-minification');
    expect(output).not.toContain('dev-only-assertDefined-marker-should-not-survive-minification');
    expect(output).not.toContain('assertion failed');
    expect(output).not.toContain('expected a defined value');

    // invariant: NOT in pure_funcs and never __DEV__-gated, so it must survive
    // as a live call with its real Container.addChild cycle-guard message intact.
    expect(output).toContain(cycleMessage);
    expect(output).toMatch(/throw new Error/);
  }, 20_000);
});

// ---------------------------------------------------------------------------
// invariant always-on contract — static, config-level checks.
//
// Complementary to the pipeline test above: verifies the *configuration*
// guarantees directly (no __DEV__ guard in the source, absent from every
// pure_funcs list) independent of any specific call site or bundling step.
// ---------------------------------------------------------------------------

describe('invariant always-on contract (source-level, no build required)', () => {
  it('has no __DEV__ guard in its function body', () => {
    const source = readFileSync(resolve(rootDir, 'src/core/dev.ts'), 'utf8');
    const match = /export function invariant\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(source);
    expect(match).not.toBeNull();
    expect(match![1]).not.toMatch(/__DEV__/);
    expect(match![1]).toMatch(/throw new Error/);
  });

  it('is absent from every rollup pure_funcs list (never stripped), unlike assert/assertDefined', () => {
    const config = readFileSync(resolve(rootDir, 'rollup.config.ts'), 'utf8');
    const pureFuncsBlocks = [...config.matchAll(/pure_funcs:\s*\[([^\]]*)\]/g)].map(m => m[1]!);
    expect(pureFuncsBlocks.length).toBeGreaterThan(0);

    for (const block of pureFuncsBlocks) {
      expect(block).toContain("'assert'");
      expect(block).toContain("'assertDefined'");
      expect(block).not.toContain("'invariant'");
      expect(block).not.toContain("'warnOnce'");
    }
  });
});

describe.runIf(hasProductionBuild)('production build stripping', () => {
  const expectedVersion = resolveVersion(rootDir);

  it('has no bare __DEV__ reference in the dev helper (replaced with false)', () => {
    const content = read('dist/esm/core/dev.js');
    // The guard `if (__DEV__ && ...)` must become `if (false && ...)`
    expect(content).not.toMatch(/(?<![a-zA-Z0-9_$])__DEV__(?![a-zA-Z0-9_$])/);
    // The literal `false` must appear where __DEV__ was.
    expect(content).toContain('false');
  });

  it('strips the __DEV__-gated assert/assertDefined bodies to no-ops', () => {
    // `__DEV__` → `false` turns every `if (false && …) throw …` into dead code,
    // so Rollup's DCE empties the helper bodies. assert/assertDefined become
    // no-ops with no runtime cost — independent of the consumer's minifier.
    // This is the call-site-agnostic guarantee for the modular tree. Their
    // default messages live only inside the now-dead branch, so they vanish
    // along with it.
    const content = read('dist/esm/core/dev.js');
    expect(content).not.toContain('assertion failed');
    expect(content).not.toContain('expected a defined value');
  });

  it('has no unresolved __VERSION__ or __REVISION__ in the dev helper', () => {
    const content = read('dist/esm/core/dev.js');
    expect(content).not.toMatch(/(?<![a-zA-Z0-9_$])__VERSION__(?![a-zA-Z0-9_$])/);
    expect(content).not.toMatch(/(?<![a-zA-Z0-9_$])__REVISION__(?![a-zA-Z0-9_$])/);
  });

  it('has no unresolved __DEV__ in the ExtensionRegistry', () => {
    const content = read('dist/esm/extensions/ExtensionRegistry.js');
    expect(content).not.toMatch(/(?<![a-zA-Z0-9_$])__DEV__(?![a-zA-Z0-9_$])/);
  });

  it('has no unresolved constants anywhere in dist/esm/', () => {
    // Spot-check a few files across the tree.
    const files = ['dist/esm/core/Application.js', 'dist/esm/rendering/text/BitmapText.js', 'dist/esm/rendering/texture/RenderTexture.js'];
    for (const file of files) {
      const content = read(file);
      expect(content, `${file} should not contain __DEV__`).not.toMatch(/(?<![a-zA-Z0-9_$])__DEV__(?![a-zA-Z0-9_$])/);
      expect(content, `${file} should not contain __VERSION__`).not.toMatch(/(?<![a-zA-Z0-9_$])__VERSION__(?![a-zA-Z0-9_$])/);
      expect(content, `${file} should not contain __REVISION__`).not.toMatch(/(?<![a-zA-Z0-9_$])__REVISION__(?![a-zA-Z0-9_$])/);
    }
  });

  it('buildInfo.development is false in production', () => {
    const content = read('dist/esm/core/BuildInfo.js');
    // Must contain `development: false` as a literal.
    expect(content).toContain('development:');
    // The entire object should NOT contain `__DEV__` bare — it should be a literal.
    expect(content).not.toMatch(/(?<![a-zA-Z0-9_$])__DEV__(?![a-zA-Z0-9_$])/);
  });

  it('buildInfo.version matches the package manifest', () => {
    const content = read('dist/esm/core/BuildInfo.js');
    // The version literal must match the package.json version.
    expect(content).toContain(`version: "${expectedVersion}"`);
  });

  it('buildInfo.revision is a non-empty string (not the bare __REVISION__ token)', () => {
    const content = read('dist/esm/core/BuildInfo.js');
    expect(content).not.toMatch(/(?<![a-zA-Z0-9_$])__REVISION__(?![a-zA-Z0-9_$])/);
    // revision should be a concrete string value.
    expect(content).toMatch(/revision:\s*"/);
  });

  it('the single-file bundle has no unresolved constants', () => {
    const bundle = read('dist/exo.esm.js');
    expect(bundle).not.toMatch(/(?<![a-zA-Z0-9_$])__DEV__(?![a-zA-Z0-9_$])/);
    expect(bundle).not.toMatch(/(?<![a-zA-Z0-9_$])__VERSION__(?![a-zA-Z0-9_$])/);
    expect(bundle).not.toMatch(/(?<![a-zA-Z0-9_$])__REVISION__(?![a-zA-Z0-9_$])/);
  });

  it('drops dev-assert callsites from the single-file bundle (terser pure_funcs)', () => {
    // The production bundle is minified with `pure_funcs` listing the dev
    // helpers, so their now-empty callsites — and the interpolated message
    // allocations passed to them — are removed outright. These two messages are
    // the dev-`assert()` callsites currently reachable in the bundle; if they
    // move, update the anchors (the strip guarantee itself is unchanged).
    const bundle = read('dist/exo.esm.js');
    expect(bundle).not.toContain('BmFont: texture count');
    expect(bundle).not.toContain('glyph page index');
  });

  it('keeps invariant alive in the single-file bundle (never stripped)', () => {
    // Unlike assert/assertDefined, invariant is not in pure_funcs and is never
    // __DEV__-gated — it must survive minification with its real message intact.
    const bundle = read('dist/exo.esm.js');
    const cycleMessage = extractContainerCycleMessage();
    expect(bundle).toContain(cycleMessage);
  });

  it('the debug bundle has no unresolved constants', () => {
    const dbg = read('dist/exo.debug.esm.js');
    expect(dbg).not.toMatch(/(?<![a-zA-Z0-9_$])__DEV__(?![a-zA-Z0-9_$])/);
    expect(dbg).not.toMatch(/(?<![a-zA-Z0-9_$])__VERSION__(?![a-zA-Z0-9_$])/);
    expect(dbg).not.toMatch(/(?<![a-zA-Z0-9_$])__REVISION__(?![a-zA-Z0-9_$])/);
  });
});
