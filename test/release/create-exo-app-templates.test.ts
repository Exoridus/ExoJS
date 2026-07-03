import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Version-agnostic guard for packages/create-exo-app/templates/*/package.json:
// every scaffolded app depends on `@codexo/exojs` (and, if a template ever grows
// one, an `@codexo/exojs-*` extension), and that dependency range must never be
// allowed to silently drift from the package it actually resolves against —
// otherwise `npm create exo-app` hands out a project that breaks on install or
// at runtime. Nothing here is hard-coded to a version number; both the current
// version and the templates are read from disk so this test never goes stale on
// a version bump (mirrors `release-coherence.test.ts`).
const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..', '..');

interface Manifest {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const readManifest = (path: string): Manifest => JSON.parse(readFileSync(path, 'utf8')) as Manifest;

const templatesDir = resolve(repoRoot, 'packages', 'create-exo-app', 'templates');
const templateDirs = readdirSync(templatesDir, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort();

// name -> version for every package that a template could plausibly depend on
// (Core plus every extension under packages/*). Read from disk, not hard-coded,
// so a new extension package (or a version bump of an existing one) is picked
// up automatically.
const corePkg = readManifest(resolve(repoRoot, 'package.json'));
const packagesDir = resolve(repoRoot, 'packages');
const publishedVersions = new Map<string, string>();
if (corePkg.name !== undefined && corePkg.version !== undefined) {
  publishedVersions.set(corePkg.name, corePkg.version);
}
for (const dir of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  try {
    const manifest = readManifest(resolve(packagesDir, dir.name, 'package.json'));
    if (manifest.name !== undefined && manifest.version !== undefined) {
      publishedVersions.set(manifest.name, manifest.version);
    }
  } catch {
    // No package.json (or unreadable) — not a package directory, skip.
  }
}

/**
 * A dependency range on an `@codexo/exojs*` package is considered in sync with
 * `version` when it is:
 *   - the literal `latest` dist-tag (the documented create-exo-app convention —
 *     see scripts/verify-create-exo-app.ts — which by construction can never
 *     drift, since it always resolves to whatever is newest on npm); or
 *   - an exact match of `version` (optionally caret-prefixed); or
 *   - the lockstep `<major>.<minor>.x` form used elsewhere in the repo (see
 *     scripts/verify-lockstep-versions.ts) for the same major.minor as `version`.
 * Anything else (a stale pin, a mismatched major/minor, a `workspace:` protocol
 * range that would break a published scaffold) fails.
 */
function isInSyncRange(range: string, version: string): boolean {
  if (range === 'latest') return true;
  if (range === version || range === `^${version}`) return true;

  const [major, minor] = version.split('.');
  return range === `${major}.${minor}.x` || range === `^${major}.${minor}.0`;
}

describe('create-exo-app template version sync', () => {
  it('discovers at least one template', () => {
    expect(templateDirs.length).toBeGreaterThan(0);
  });

  it('every published @codexo/exojs* package resolved from disk has a version', () => {
    expect(publishedVersions.size).toBeGreaterThan(0);
    expect(publishedVersions.get('@codexo/exojs')).toBe(corePkg.version);
  });

  for (const template of templateDirs) {
    const manifest = readManifest(resolve(templatesDir, template, 'package.json'));
    const deps = { ...manifest.dependencies, ...manifest.devDependencies };
    const exoDeps = Object.entries(deps).filter(([name]) => name === '@codexo/exojs' || name.startsWith('@codexo/exojs-'));

    it(`${template}: declares a @codexo/exojs dependency`, () => {
      expect(manifest.dependencies?.['@codexo/exojs']).toBeDefined();
    });

    it(`${template}: never uses the workspace: protocol (not publishable)`, () => {
      for (const [, range] of exoDeps) {
        expect(range.startsWith('workspace:')).toBe(false);
      }
    });

    for (const [name, range] of exoDeps) {
      it(`${template}: ${name}@"${range}" is in sync with the published version`, () => {
        const publishedVersion = publishedVersions.get(name);
        expect(publishedVersion, `no package under packages/ (or root) publishes "${name}"`).toBeDefined();
        expect(isInSyncRange(range, publishedVersion!), `"${range}" is not in sync with ${name}@${publishedVersion} — update the template`).toBe(true);
      });
    }
  }

  it('every template agrees on the same @codexo/exojs range (no partial-update drift)', () => {
    const ranges = new Set(templateDirs.map(template => readManifest(resolve(templatesDir, template, 'package.json')).dependencies?.['@codexo/exojs']));
    expect([...ranges]).toHaveLength(1);
  });
});
