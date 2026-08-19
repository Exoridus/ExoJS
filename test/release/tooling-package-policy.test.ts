// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyToolingPackage } from '@codexo/exojs-config/package-policy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { INDEPENDENT_PACKAGES, LOCKSTEP_PACKAGES } from '../../scripts/release/lockstep-packages';
import { PUBLISH_ORDER } from '../../scripts/release/manifest';

/**
 * `@codexo/exojs-build` is published on its own version line rather than the
 * engine lockstep, and is checked against a different policy profile than the
 * runtime packages. Both are deliberate exceptions, so both need a gate: the
 * failure mode otherwise is a package that quietly falls out of every release
 * check because it is missing from the list those checks iterate.
 */
const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const readManifest = (relativeDir: string): { name: string; version: string } =>
  JSON.parse(readFileSync(resolve(repoRoot, relativeDir, 'package.json'), 'utf8')) as { name: string; version: string };

const buildPackage = INDEPENDENT_PACKAGES.find(pkg => pkg.name === '@codexo/exojs-build');

let scratch: string;

/** A minimal on-disk package that satisfies the profile, for mutation in the negative cases. */
const writePackage = (manifest: Record<string, unknown>): string => {
  const dir = mkdtempSync(join(scratch, 'pkg-'));

  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest), 'utf8');
  writeFileSync(join(dir, 'LICENSE'), 'MIT', 'utf8');
  writeFileSync(join(dir, 'README.md'), '# tooling', 'utf8');

  return dir;
};

const validManifest = (): Record<string, unknown> => ({
  name: '@codexo/exojs-build',
  version: '0.1.0',
  type: 'module',
  sideEffects: false,
  repository: { type: 'git', url: 'git+https://example.invalid/repo.git' },
  exports: {
    '.': { types: './dist/esm/index.d.ts', import: './dist/esm/index.js' },
    './package.json': './package.json',
  },
  files: ['dist/esm/', 'LICENSE'],
  dependencies: { esbuild: '^0.25.0' },
  publishConfig: { access: 'public' },
});

const failedChecks = (dir: string): string[] =>
  verifyToolingPackage(dir, { name: '@codexo/exojs-build' })
    .checks.filter(check => !check.ok)
    .map(check => check.name);

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'exojs-tooling-policy-'));
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('tooling package policy', () => {
  it('passes for the real package', () => {
    expect(buildPackage).toBeDefined();
    expect(failedChecks(resolve(repoRoot, buildPackage!.dir))).toStrictEqual([]);
  });

  it('accepts the reference manifest, so the negative cases isolate one fault each', () => {
    expect(failedChecks(writePackage(validManifest()))).toStrictEqual([]);
  });

  it('rejects a runtime dependency on the engine', () => {
    const dir = writePackage({ ...validManifest(), dependencies: { esbuild: '^0.25.0', '@codexo/exojs': '0.15.x' } });

    expect(failedChecks(dir)).toContain('no engine dependency');
  });

  it('rejects a peer dependency on the engine', () => {
    const dir = writePackage({ ...validManifest(), peerDependencies: { '@codexo/exojs': '0.15.x' } });

    expect(failedChecks(dir)).toContain('no engine dependency');
  });

  it('rejects any dependency on the private repository config', () => {
    const dir = writePackage({ ...validManifest(), devDependencies: { '@codexo/exojs-config': 'workspace:*' } });

    expect(failedChecks(dir)).toContain('no private config dependency');
  });

  it('rejects a workspace protocol that would break a published tarball', () => {
    const dir = writePackage({ ...validManifest(), dependencies: { esbuild: 'workspace:*' } });

    expect(failedChecks(dir)).toContain('no workspace: in deps');
  });

  it('rejects a package that is not publishable', () => {
    const dir = writePackage({ ...validManifest(), private: true, publishConfig: undefined });

    expect(failedChecks(dir)).toEqual(expect.arrayContaining(['not private', 'publishConfig public']));
  });
});

describe('independent versioning', () => {
  it('keeps the build tooling off the engine lockstep line', () => {
    const core = readManifest('.');
    const build = readManifest(buildPackage!.dir);

    expect(build.version).not.toBe(core.version);
  });

  it('records a reason for every package that is off the lockstep line', () => {
    expect(INDEPENDENT_PACKAGES.map(pkg => pkg.name)).toContain('@codexo/exojs-build');

    for (const pkg of INDEPENDENT_PACKAGES) {
      expect(pkg.reason.trim().length, `${pkg.name} needs a reason`).toBeGreaterThan(0);
    }
  });

  it('keeps them out of the coordinated publish, in both directions', () => {
    const independent = new Set<string>(INDEPENDENT_PACKAGES.map(pkg => pkg.name));

    expect(PUBLISH_ORDER.filter(name => independent.has(name))).toStrictEqual([]);
    expect(LOCKSTEP_PACKAGES.map(pkg => pkg.name).filter(name => independent.has(name))).toStrictEqual([]);
  });
});
