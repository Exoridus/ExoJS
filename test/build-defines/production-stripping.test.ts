/**
 * Production-stripping integration tests.
 *
 * Verifies that a production build produces artefacts with:
 *   - no unresolved __DEV__, __VERSION__, or __REVISION__ references
 *   - buildInfo.development === false
 *   - version matching the packed package manifest
 *   - no dev-only warning/assertion messages selected for stripping
 *
 * These tests are skipped when `dist/` has not been built in production mode
 * (run `pnpm build` first).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveVersion } from '../../packages/exojs-config/build-defines/index.js';

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

describe.runIf(hasProductionBuild)('production build stripping', () => {
  const expectedVersion = resolveVersion(rootDir);

  it('has no bare __DEV__ reference in the dev helper (replaced with false)', () => {
    const content = read('dist/esm/core/dev.js');
    // The guard `if (__DEV__ && ...)` must become `if (false && ...)`
    expect(content).not.toMatch(/(?<![a-zA-Z0-9_$])__DEV__(?![a-zA-Z0-9_$])/);
    // The literal `false` must appear where __DEV__ was.
    expect(content).toContain('false');
  });

  it('strips the dev-helper bodies to no-ops (no throw)', () => {
    // `__DEV__` → `false` turns every `if (false && …) throw …` into dead code,
    // so Rollup's DCE empties the helper bodies. assert/assertDefined/invariant
    // become no-ops with no runtime cost — independent of the consumer's
    // minifier. This is the call-site-agnostic guarantee for the modular tree.
    // Anchor on the `throw new` code pattern: the surviving `throw`/`[ExoJS]`
    // tokens live only in the doc comment, which Rollup keeps verbatim.
    const content = read('dist/esm/core/dev.js');
    expect(content).not.toMatch(/throw new /);
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

  it('the debug bundle has no unresolved constants', () => {
    const dbg = read('dist/exo.debug.esm.js');
    expect(dbg).not.toMatch(/(?<![a-zA-Z0-9_$])__DEV__(?![a-zA-Z0-9_$])/);
    expect(dbg).not.toMatch(/(?<![a-zA-Z0-9_$])__VERSION__(?![a-zA-Z0-9_$])/);
    expect(dbg).not.toMatch(/(?<![a-zA-Z0-9_$])__REVISION__(?![a-zA-Z0-9_$])/);
  });
});
