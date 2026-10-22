import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  computeContentHash,
  createSiteBuildManifest,
  hashTreeFiles,
  parseSiteBuildManifest,
  SITE_BUILD_FILE,
  SITE_BUILD_SCHEMA_VERSION,
  type SiteBuildIdentity,
  validateSitePath,
  verifySiteTree,
} from '../../scripts/pages/site-manifest';

/**
 * `site-build.json` identifies one built channel tree: which commit, version,
 * channel and base it was built for, and exactly which bytes it consists of.
 * The publisher trusts a tree only when it matches this manifest, so the
 * format, the path rules and the hash are pinned here.
 */

let tree: string;

const write = (rel: string, content: string): void => {
  const abs = join(tree, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, content);
};

const identity: SiteBuildIdentity = {
  channel: 'next',
  basePath: '/ExoJS/next/',
  sourceSha: 'a'.repeat(40),
  packageVersion: '0.19.1',
  assetProfile: 'standard',
  createdAt: '2026-10-21T12:00:00.000Z',
  localTest: false,
};

beforeEach(() => {
  tree = mkdtempSync(join(tmpdir(), 'exo-site-manifest-'));
  write('index.html', '<html></html>');
  write('en/index.html', 'en');
  write('vendor/exojs/esm/index.js', 'export {};');
  write('B.txt', 'upper');
  write('a.txt', 'lower');
});

afterEach(() => rmSync(tree, { recursive: true, force: true }));

describe('validateSitePath', () => {
  it('accepts plain relative POSIX paths', () => {
    for (const path of ['index.html', 'en/guide/index.html', '_astro/x.CbA9.js', 'pagefind/fragment/en_1.pf_fragment', '.nojekyll']) {
      expect(validateSitePath(path), `${path}`).toBeNull();
    }
  });

  it('rejects absolute, traversing, Windows-shaped and control-character paths', () => {
    for (const path of ['', '/etc/passwd', '../outside', 'a/../../b', 'a/./b', 'a//b', 'a/', 'C:/x', 'c:x', 'a\\b', 'a\u0000b', 'a\nb', 'a:b', '.', '..']) {
      expect(validateSitePath(path), `${JSON.stringify(path)}`).not.toBeNull();
    }
  });
});

describe('hashTreeFiles and computeContentHash', () => {
  it('lists every file once, sorted by code unit, with size and SHA-256', () => {
    const files = hashTreeFiles(tree);
    expect(files.map(file => file.path)).toEqual(['B.txt', 'a.txt', 'en/index.html', 'index.html', 'vendor/exojs/esm/index.js']);
    expect(files.find(file => file.path === 'a.txt')).toEqual({
      path: 'a.txt',
      size: 5,
      sha256: createHash('sha256').update('lower').digest('hex'),
    });
  });

  it('is deterministic and changes with any byte or path', () => {
    const first = computeContentHash(hashTreeFiles(tree));
    expect(computeContentHash(hashTreeFiles(tree))).toBe(first);
    write('a.txt', 'Lower');
    const edited = computeContentHash(hashTreeFiles(tree));
    expect(edited).not.toBe(first);
    rmSync(join(tree, 'a.txt'));
    write('c.txt', 'Lower');
    expect(computeContentHash(hashTreeFiles(tree))).not.toBe(edited);
  });
});

describe('createSiteBuildManifest', () => {
  it('records the identity, the file list and its hash, excluding itself', () => {
    write(SITE_BUILD_FILE, '{"stale":true}');
    const manifest = createSiteBuildManifest(tree, identity);

    expect(manifest).toMatchObject({ schemaVersion: SITE_BUILD_SCHEMA_VERSION, ...identity, fileCount: 5 });
    expect(manifest.files.some(file => file.path === SITE_BUILD_FILE)).toBe(false);
    expect(manifest.totalBytes).toBe(manifest.files.reduce((sum, file) => sum + file.size, 0));
    expect(manifest.contentHash).toBe(computeContentHash(manifest.files));
  });

  it('only excludes the manifest at the tree root', () => {
    write(`nested/${SITE_BUILD_FILE}`, '{}');
    expect(createSiteBuildManifest(tree, identity).files.some(file => file.path === `nested/${SITE_BUILD_FILE}`)).toBe(true);
  });

  it('refuses an identity that is not publishable as declared', () => {
    expect(() => createSiteBuildManifest(tree, { ...identity, sourceSha: 'abc' })).toThrow(/sourceSha/);
    expect(() => createSiteBuildManifest(tree, { ...identity, packageVersion: '0.20' })).toThrow(/packageVersion/);
    expect(() => createSiteBuildManifest(tree, { ...identity, basePath: '/ExoJS/' })).toThrow(/basePath/);
    expect(() => createSiteBuildManifest(tree, { ...identity, createdAt: 'yesterday' })).toThrow(/createdAt/);
    expect(() => createSiteBuildManifest(tree, { ...identity, assetProfile: 'tiny' as 'standard' })).toThrow(/assetProfile/);
  });

  it('keeps a local test base and flags it, so the publisher can refuse it', () => {
    const manifest = createSiteBuildManifest(tree, { ...identity, basePath: '/sandbox/', localTest: true });
    expect(manifest).toMatchObject({ basePath: '/sandbox/', localTest: true });
  });
});

describe('parseSiteBuildManifest', () => {
  const valid = (): Record<string, unknown> => JSON.parse(JSON.stringify(createSiteBuildManifest(tree, identity))) as Record<string, unknown>;

  it('round-trips a written manifest', () => {
    const manifest = createSiteBuildManifest(tree, identity);
    expect(parseSiteBuildManifest(JSON.parse(JSON.stringify(manifest)))).toEqual(manifest);
  });

  it('rejects an unknown schema version, a missing field and a forged count or hash', () => {
    expect(() => parseSiteBuildManifest({ ...valid(), schemaVersion: 2 })).toThrow(/schemaVersion/);
    const { channel: _channel, ...withoutChannel } = valid();
    expect(() => parseSiteBuildManifest(withoutChannel)).toThrow(/channel/);
    expect(() => parseSiteBuildManifest({ ...valid(), fileCount: 99 })).toThrow(/fileCount/);
    expect(() => parseSiteBuildManifest({ ...valid(), contentHash: 'f'.repeat(64) })).toThrow(/contentHash/);
  });

  it('rejects unsafe, duplicate or unsorted file paths', () => {
    const files = valid()['files'] as Array<Record<string, unknown>>;
    expect(() => parseSiteBuildManifest({ ...valid(), files: [{ ...files[0], path: '../x' }, ...files.slice(1)] })).toThrow(/path/);
    expect(() => parseSiteBuildManifest({ ...valid(), files: [files[0], ...files] })).toThrow(/sorted|duplicate/);
    expect(() => parseSiteBuildManifest({ ...valid(), files: [...files].reverse() })).toThrow(/sorted|duplicate/);
  });

  it('rejects a non-object and a list that names the manifest itself', () => {
    expect(() => parseSiteBuildManifest(null)).toThrow();
    expect(() => parseSiteBuildManifest('{}')).toThrow();
    const files = valid()['files'] as Array<Record<string, unknown>>;
    const selfListed = [...files, { path: SITE_BUILD_FILE, size: 1, sha256: '0'.repeat(64) }].sort((a, b) => (String(a['path']) < String(b['path']) ? -1 : 1));
    expect(() => parseSiteBuildManifest({ ...valid(), files: selfListed, fileCount: selfListed.length })).toThrow(SITE_BUILD_FILE);
  });
});

describe('verifySiteTree', () => {
  it('passes the tree the manifest was made from', () => {
    const manifest = createSiteBuildManifest(tree, identity);
    write(SITE_BUILD_FILE, JSON.stringify(manifest));
    expect(verifySiteTree(tree, manifest)).toEqual([]);
  });

  it('reports a changed, a missing and an unexpected file', () => {
    const manifest = createSiteBuildManifest(tree, identity);
    write('a.txt', 'tampered');
    rmSync(join(tree, 'B.txt'));
    write('extra.js', 'alert(1)');
    const problems = verifySiteTree(tree, manifest).join('\n');
    expect(problems).toMatch(/a\.txt/);
    expect(problems).toMatch(/missing.*B\.txt/);
    expect(problems).toMatch(/unexpected.*extra\.js/);
  });

  it('tolerates only the extra paths the caller names', () => {
    const manifest = createSiteBuildManifest(tree, identity);
    write('next/index.html', 'next');
    expect(verifySiteTree(tree, manifest, { allowExtra: path => path.startsWith('next/') })).toEqual([]);
    expect(verifySiteTree(tree, manifest)).not.toEqual([]);
  });
});
