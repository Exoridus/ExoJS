import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PUBLISH_ORDER, type ReleaseManifest, renderChecksums, serializeManifest, sha256File, verifyManifestArtifacts } from '../../scripts/release/manifest';

let dir: string;
let manifest: ReleaseManifest;
const resolveArtifact = (file: string): string => join(dir, file);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'exo-manifest-'));
  const packages = PUBLISH_ORDER.map((name, i) => {
    const file = `${name.replace('@', '').replace('/', '-')}-0.12.0.tgz`;
    writeFileSync(join(dir, file), `content-${name}-${i}`);
    const { sha256, bytes } = sha256File(join(dir, file));
    return { name, version: '0.12.0', file, sha256, bytes };
  });
  manifest = {
    version: '0.12.0',
    tag: 'v0.12.0',
    generatedAt: '2026-06-08T00:00:00.000Z',
    publishOrder: [...PUBLISH_ORDER],
    packages,
  };
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('verifyManifestArtifacts — build-once drift detection', () => {
  it('reports no drift when tarballs are byte-identical to the manifest', () => {
    expect(verifyManifestArtifacts(manifest, resolveArtifact)).toEqual([]);
  });

  it('detects a content change (same size, different bytes) as hash-mismatch', () => {
    // Same length, flipped byte → only the hash changes.
    writeFileSync(join(dir, manifest.packages[0].file), 'content-@codexo/exojs-X');
    const issues = verifyManifestArtifacts(manifest, resolveArtifact);
    expect(issues).toHaveLength(1);
    expect(issues[0].reason).toBe('hash-mismatch');
    expect(issues[0].file).toBe(manifest.packages[0].file);
  });

  it('detects a regenerated (different size) tarball as size-mismatch', () => {
    writeFileSync(join(dir, manifest.packages[1].file), 'a-totally-different-and-longer-tarball-body');
    const issues = verifyManifestArtifacts(manifest, resolveArtifact);
    expect(issues).toHaveLength(1);
    expect(issues[0].reason).toBe('size-mismatch');
  });

  it('detects a deleted tarball as missing', () => {
    rmSync(join(dir, manifest.packages[2].file));
    const issues = verifyManifestArtifacts(manifest, resolveArtifact);
    expect(issues[0].reason).toBe('missing');
  });

  it('ignores the fullZip record (a GitHub asset, not an npm tarball)', () => {
    const withZip: ReleaseManifest = {
      ...manifest,
      fullZip: { file: 'exojs-v0.12.0-full.zip', sha256: 'deadbeef', bytes: 1 },
    };
    // The zip is not on disk in `dir`, but the drift check must not fail on it.
    expect(verifyManifestArtifacts(withZip, resolveArtifact)).toEqual([]);
  });
});

describe('renderChecksums', () => {
  it('emits one sorted `<hex>  <file>` line per tarball, no fullZip', () => {
    const body = renderChecksums({
      ...manifest,
      fullZip: { file: 'exojs-v0.12.0-full.zip', sha256: 'zzz', bytes: 1 },
    });
    const lines = body.trimEnd().split('\n');
    expect(lines).toHaveLength(3);
    expect(body).not.toContain('full.zip');
    for (const line of lines) expect(line).toMatch(/^[a-f0-9]{64} {2}codexo-/);
  });

  it('applies a path prefix so checksums resolve from the tree root', () => {
    const body = renderChecksums(manifest, 'npm/');
    expect(body.split('\n').every(l => l === '' || l.includes('  npm/'))).toBe(true);
  });
});

describe('serializeManifest', () => {
  it('is deterministic and ends with a trailing newline', () => {
    const a = serializeManifest(manifest);
    const b = serializeManifest(JSON.parse(serializeManifest(manifest)) as ReleaseManifest);
    expect(a).toBe(b);
    expect(a.endsWith('\n')).toBe(true);
  });
});
