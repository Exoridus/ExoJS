import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  candidateArtifactName,
  openChannelArchive,
  parseCandidateArtifactName,
  verifyChannelTree,
  verifyDigest,
} from '../../scripts/pages/channel-artifact';
import { createSiteBuildManifest, SITE_BUILD_FILE, type SiteBuildIdentity } from '../../scripts/pages/site-manifest';
import { createZip } from '../support/archive-fixtures';

/**
 * A channel candidate is the zip of one built tree plus its `site-build.json`.
 * Its name, its bytes and its manifest have to agree with the run metadata
 * GitHub reports before the publisher uses it.
 */

const SHA = 'c'.repeat(40);

let work: string;

const identity: SiteBuildIdentity = {
  channel: 'next',
  basePath: '/ExoJS/next/',
  sourceSha: SHA,
  packageVersion: '0.19.1',
  assetProfile: 'full',
  createdAt: '2026-10-21T12:00:00.000Z',
  localTest: false,
};

const buildTree = (overrides: Partial<SiteBuildIdentity> = {}): string => {
  const dir = join(work, 'tree');
  mkdirSync(join(dir, 'en'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), 'x');
  writeFileSync(join(dir, 'en/index.html'), 'y');
  writeFileSync(join(dir, SITE_BUILD_FILE), JSON.stringify(createSiteBuildManifest(dir, { ...identity, ...overrides })));

  return dir;
};

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'exo-channel-artifact-'));
});

afterEach(() => rmSync(work, { recursive: true, force: true }));

describe('candidate artifact names', () => {
  it('round-trips site-<channel>-<sha>-<attempt>', () => {
    expect(candidateArtifactName('next', SHA, 2)).toBe(`site-next-${SHA}-2`);
    expect(parseCandidateArtifactName(`site-stable-${SHA}-1`)).toEqual({ channel: 'stable', sha: SHA, attempt: 1 });
  });

  it('rejects anything else', () => {
    for (const name of [
      `site-dist-${SHA}`,
      `site-beta-${SHA}-1`,
      `site-next-${SHA.slice(1)}-1`,
      `site-next-${SHA}-0`,
      `site-next-${SHA}-1x`,
      'github-pages',
    ]) {
      expect(parseCandidateArtifactName(name), `${name}`).toBeNull();
    }
  });
});

describe('verifyDigest', () => {
  it('compares the archive bytes against the digest GitHub reported', () => {
    const bytes = Buffer.from('zip bytes');
    const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    expect(verifyDigest(bytes, digest)).toBeNull();
    expect(verifyDigest(Buffer.from('other'), digest)).toMatch(/digest/);
    expect(verifyDigest(bytes, 'sha1:abc')).toMatch(/digest/);
  });
});

describe('verifyChannelTree', () => {
  it('accepts a tree that matches the expected channel and commit', () => {
    expect(verifyChannelTree(buildTree(), { channel: 'next', sourceSha: SHA }).problems).toEqual([]);
  });

  it.each<[string, Partial<SiteBuildIdentity>, RegExp]>([
    ['another commit', { sourceSha: 'd'.repeat(40) }, /sourceSha/],
    ['another channel', { channel: 'stable', basePath: '/ExoJS/' }, /channel/],
    ['a local test base', { basePath: '/sandbox/', localTest: true }, /local test/],
  ])('refuses %s', (_label, overrides, pattern) => {
    expect(verifyChannelTree(buildTree(overrides), { channel: 'next', sourceSha: SHA }).problems.join('\n')).toMatch(pattern);
  });

  it('refuses a tree without a manifest or with a tampered file', () => {
    const dir = buildTree();
    writeFileSync(join(dir, 'en/index.html'), 'tampered');
    expect(verifyChannelTree(dir, { channel: 'next', sourceSha: SHA }).problems.join('\n')).toMatch(/en\/index\.html/);
    rmSync(join(dir, SITE_BUILD_FILE));
    expect(verifyChannelTree(dir, { channel: 'next', sourceSha: SHA }).problems.join('\n')).toMatch(SITE_BUILD_FILE);
  });
});

describe('openChannelArchive', () => {
  it('extracts a verified candidate zip and checks its manifest', () => {
    const tree = buildTree();
    const zip = createZip([
      { name: 'index.html', data: 'x' },
      { name: 'en/index.html', data: 'y' },
      { name: SITE_BUILD_FILE, data: JSON.stringify(createSiteBuildManifest(tree, identity)) },
    ]);
    const digest = `sha256:${createHash('sha256').update(zip).digest('hex')}`;
    const out = join(work, 'out');
    expect(openChannelArchive(zip, { digest, channel: 'next', sourceSha: SHA, outDir: out }).manifest.contentHash).toHaveLength(64);
    expect(() =>
      openChannelArchive(zip, { digest: `sha256:${'0'.repeat(64)}`, channel: 'next', sourceSha: SHA, outDir: join(work, 'o2') }),
    ).toThrow(/digest/);
  });
});
