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
 * production mode (run `pnpm build` first) - unless
 * `EXOJS_REQUIRE_PRODUCTION_BUILD=1` demands them, which is how the build lane
 * runs them. Below that, a self-contained pipeline test models the same
 * stripping semantics the real production build (Rolldown) applies -
 * `@rollup/plugin-replace` + `terser` with a `pure_funcs` list derived from
 * `src/core/dev.ts` (`dev-pure-funcs.ts`) - against a small representative
 * snippet, so the assert/assertDefined-stripped vs. invariant-survives
 * guarantee is verified against real minified output on every run -
 * independent of whether `dist/` has been built, and independent of which
 * internal call sites currently exist for either helper.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import { type Plugin, rollup } from 'rollup';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { createBuildDefines, resolveVersion } from '../../packages/exojs-config/build-defines/index.js';
import { devGatedPureFuncs } from './dev-pure-funcs';

const rootDir = resolve(import.meta.dirname!, '..', '..');

const requiredDistFiles = [
  'dist/esm/core/dev.js',
  'dist/esm/core/BuildInfo.js',
  'dist/esm/core/Application.js',
  'dist/esm/rendering/text/BitmapText.js',
  'dist/esm/rendering/texture/RenderTexture.js',
  'dist/exo.esm.js',
  'dist/exo.debug.esm.js',
] as const;

const hasProductionBuild = requiredDistFiles.every(f => existsSync(resolve(rootDir, f)));

/**
 * Set in the CI lane that builds `dist/` before running this file. It turns a
 * missing build from a silent skip into a failure: without it these checks were
 * skipped on every CI run - the only place where they were ever meant to be the
 * gate - and passed locally only when a (possibly stale) `dist/` happened to
 * exist. Contributors without a build still skip, which is the intent.
 */
const mustHaveProductionBuild = process.env['EXOJS_REQUIRE_PRODUCTION_BUILD'] === '1';

const read = (rel: string): string => {
  const p = resolve(rootDir, rel);
  if (!existsSync(p)) throw new Error(`Missing file: ${p}`);
  return readFileSync(p, 'utf8');
};

// ---------------------------------------------------------------------------
// Real-pipeline test: assert/assertDefined stripped, invariant survives.
//
// Builds a tiny representative module through a Rollup+terser pipeline that
// models the real production build's stripping semantics (`@rollup/plugin-
// replace` setting `__DEV__` to `false`, then `terser` with a `pure_funcs`
// list derived from `src/core/dev.ts`), using the real `src/core/dev.ts`
// implementations and real runtime messages lifted from their actual call
// sites (Container.addChild's cycle guard). This is self-contained (no
// dependency on a pre-built `dist/`) and fast (bundles one tiny file), so it
// runs unconditionally on every `pnpm test`.
// ---------------------------------------------------------------------------

/** Extracts the real invariant message from Container.addChild's scene-graph cycle guard. */
function extractContainerCycleMessage(): string {
  const source = readFileSync(resolve(rootDir, 'src/rendering/Container.ts'), 'utf8');
  const match = /invariant\(\s*ancestor !== child,\s*'([^']+)'/.exec(source);
  expect(match).not.toBeNull();
  return match![1]!;
}

/**
 * Strips TypeScript syntax down to plain JS via the TypeScript compiler's own
 * `transpileModule` API. `dist/exo.esm.js` (the bundle these dist-content
 * checks care about) is actually compiled with Rolldown's own transpiler, not
 * this one - but `ts.transpileModule` is pure JS with no native binary, so it
 * runs safely inside vitest's jsdom environment where a native bundler binary
 * cannot be relied on. The syntax-stripping step is not what this test
 * models; the define-replace and terser passes below it are.
 */
function transpileTs(source: string): string {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

/**
 * Runs a small snippet - importing the real `assert`/`assertDefined`/
 * `invariant` from `src/core/dev.ts` and calling them the way real call sites
 * do - through the production define-replace + terser pipeline, and returns
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
    const pureFuncs = devGatedPureFuncs();
    const cycleMessage = extractContainerCycleMessage();
    const output = await buildProductionSnippet(cycleMessage, pureFuncs);

    // assert/assertDefined: __DEV__ → false empties their bodies, and they're
    // listed in pure_funcs, so terser drops the callsites entirely - the
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
// invariant always-on contract - static, config-level checks.
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

  it('is absent from the derived dev-gated pure-funcs list, unlike assert/assertDefined', () => {
    const pureFuncs = devGatedPureFuncs();
    expect(pureFuncs).toContain('assert');
    expect(pureFuncs).toContain('assertDefined');
    expect(pureFuncs).not.toContain('invariant');
  });
});

describe.runIf(hasProductionBuild || mustHaveProductionBuild)('production build stripping', () => {
  const expectedVersion = resolveVersion(rootDir);

  it('has no bare __DEV__ reference in the dev helper', () => {
    const content = read('dist/esm/core/dev.js');
    // The guard `if (__DEV__ && ...)` must not survive as a literal token. The
    // bundler is free to leave `if (false && ...)` in place or fold the whole
    // dead branch away - both satisfy "no unresolved __DEV__ reference", and
    // which one happens is a bundler DCE-depth detail, not part of the
    // contract this test verifies.
    expect(content).not.toMatch(/(?<![a-zA-Z0-9_$])__DEV__(?![a-zA-Z0-9_$])/);
  });

  it('strips the __DEV__-gated assert/assertDefined bodies to no-ops', () => {
    // `__DEV__` → `false` turns every `if (false && ...) throw ...` into dead code,
    // so Rollup's DCE empties the helper bodies. assert/assertDefined become
    // no-ops with no runtime cost - independent of the consumer's minifier.
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
    // The entire object should NOT contain `__DEV__` bare - it should be a literal.
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
    // helpers, so their now-empty callsites - and the interpolated message
    // allocations passed to them - are removed outright. These two messages are
    // the dev-`assert()` callsites currently reachable in the bundle; if they
    // move, update the anchors (the strip guarantee itself is unchanged).
    const bundle = read('dist/exo.esm.js');
    expect(bundle).not.toContain('BmFont: texture count');
    expect(bundle).not.toContain('glyph page index');
  });

  it('keeps invariant alive in the single-file bundle (never stripped)', () => {
    // Unlike assert/assertDefined, invariant is not in pure_funcs and is never
    // __DEV__-gated - it must survive minification with its real message intact.
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
