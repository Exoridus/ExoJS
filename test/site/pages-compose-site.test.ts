import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildChannelsDocument,
  type ChannelSource,
  composeSite,
  extractComposedChannel,
  findCrossChannelReferences,
  parseChannelsDocument,
} from '../../scripts/pages/compose-site';
import {
  createSiteBuildManifest,
  hashTreeFiles,
  SITE_BUILD_FILE,
  type SiteBuildIdentity,
  verifySiteTree,
} from '../../scripts/pages/site-manifest';

/**
 * The composer joins two independently qualified channel trees into the one
 * tree Pages serves: Stable at the root, Next under `next/`. It adds only
 * `channels.json` and `.nojekyll`, and it proves that neither channel's bytes
 * changed on the way.
 */

let work: string;

const sha = (seed: string): string => seed.repeat(40);

const identity = (channel: 'stable' | 'next', seed: string): SiteBuildIdentity => ({
  channel,
  basePath: channel === 'stable' ? '/ExoJS/' : '/ExoJS/next/',
  sourceSha: sha(seed),
  packageVersion: channel === 'stable' ? '0.19.1' : '0.19.1',
  assetProfile: 'standard',
  createdAt: '2026-10-21T12:00:00.000Z',
  localTest: false,
});

const source = (channel: string, seed: string): ChannelSource => ({
  kind: 'ci',
  workflowId: 11,
  runId: 100,
  runAttempt: 1,
  artifactId: 200,
  artifactName: `site-${channel}-${sha(seed)}-1`,
  digest: `sha256:${'d'.repeat(64)}`,
});

const buildChannel = (channel: 'stable' | 'next', seed: string, files: Record<string, string>): string => {
  const dir = join(work, `${channel}-${seed}`);

  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }

  const manifest = createSiteBuildManifest(dir, identity(channel, seed));
  writeFileSync(join(dir, SITE_BUILD_FILE), JSON.stringify(manifest));

  return dir;
};

const stableFiles = {
  'index.html': '<script>const baseUrl = "/ExoJS/";</script>',
  'en/index.html': '<a href="/ExoJS/en/guide/">Guide</a>',
  'preview.html': 'preview',
  'pagefind/pagefind.js': 'pf',
};

const nextFiles = {
  'index.html': '<script>const baseUrl = "/ExoJS/next/";</script>',
  'en/index.html': '<a href="/ExoJS/next/en/guide/">Guide</a><a href="/ExoJS/">Stable</a>',
  'preview.html': 'preview next',
  'pagefind/pagefind.js': 'pf next',
};

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'exo-compose-'));
});

afterEach(() => rmSync(work, { recursive: true, force: true }));

const compose = (out: string, stableDir: string, nextDir: string | null) =>
  composeSite({
    outDir: out,
    stable: { dir: stableDir, source: source('stable', 'a') },
    next: nextDir === null ? null : { dir: nextDir, source: source('next', '1') },
  });

describe('composeSite (W02)', () => {
  it('puts Stable at the root and Next under next/, adding only channels.json and .nojekyll', () => {
    const out = join(work, 'out');
    const report = compose(out, buildChannel('stable', 'a', stableFiles), buildChannel('next', '1', nextFiles));

    expect(report.problems).toEqual([]);
    expect(readdirSync(out).sort()).toEqual([
      '.nojekyll',
      'channels.json',
      'en',
      'index.html',
      'next',
      'pagefind',
      'preview.html',
      SITE_BUILD_FILE,
    ]);
    expect(readFileSync(join(out, 'next/preview.html'), 'utf8')).toBe('preview next');
    expect(readFileSync(join(out, '.nojekyll'), 'utf8')).toBe('');
  });

  it('leaves both channels byte-identical to their manifests', () => {
    const stableDir = buildChannel('stable', 'a', stableFiles);
    const nextDir = buildChannel('next', '1', nextFiles);
    const out = join(work, 'out');
    compose(out, stableDir, nextDir);

    const stableManifest = createSiteBuildManifest(stableDir, identity('stable', 'a'));
    const nextManifest = createSiteBuildManifest(nextDir, identity('next', '1'));
    const composerFiles = new Set(['channels.json', '.nojekyll']);
    expect(verifySiteTree(out, stableManifest, { allowExtra: path => path.startsWith('next/') || composerFiles.has(path) })).toEqual([]);
    expect(verifySiteTree(join(out, 'next'), nextManifest)).toEqual([]);
  });

  it('records both channels in channels.json', () => {
    const out = join(work, 'out');
    compose(out, buildChannel('stable', 'a', stableFiles), buildChannel('next', '1', nextFiles));
    const channels = parseChannelsDocument(JSON.parse(readFileSync(join(out, 'channels.json'), 'utf8')));

    expect(channels.channels.stable).toMatchObject({ basePath: '/ExoJS/', path: '', sourceSha: sha('a'), packageVersion: '0.19.1' });
    expect(channels.channels.next).toMatchObject({ basePath: '/ExoJS/next/', path: 'next/', sourceSha: sha('1'), source: { runId: 100 } });
  });

  it('composes Stable alone while Next is absent, without a next/ directory', () => {
    const out = join(work, 'out');
    const report = compose(out, buildChannel('stable', 'a', stableFiles), null);
    expect(report.problems).toEqual([]);
    expect(existsSync(join(out, 'next'))).toBe(false);
    expect(parseChannelsDocument(JSON.parse(readFileSync(join(out, 'channels.json'), 'utf8'))).channels.next).toBeNull();
  });

  it('is idempotent for the same pairing', () => {
    const stableDir = buildChannel('stable', 'a', stableFiles);
    const nextDir = buildChannel('next', '1', nextFiles);
    compose(join(work, 'one'), stableDir, nextDir);
    compose(join(work, 'two'), stableDir, nextDir);
    expect(hashTreeFiles(join(work, 'one'))).toEqual(hashTreeFiles(join(work, 'two')));
  });

  it('copies only the files a manifest lists', () => {
    const stableDir = buildChannel('stable', 'a', stableFiles);
    writeFileSync(join(stableDir, 'smuggled.js'), 'x');
    const report = compose(join(work, 'out'), stableDir, null);
    expect(report.problems.join('\n')).toMatch(/smuggled\.js/);
  });
});

describe('composeSite refuses inconsistent channels (W07)', () => {
  it('refuses swapped channels', () => {
    const report = compose(join(work, 'out'), buildChannel('next', '1', nextFiles), buildChannel('stable', 'a', stableFiles));
    expect(report.problems.join('\n')).toMatch(/channel/);
  });

  it('refuses a Stable tree that carries its own next/, channels.json or .nojekyll', () => {
    for (const [index, extra] of ['next/index.html', 'channels.json', '.nojekyll'].entries()) {
      const seed = ['b', 'c', 'e'][index]!;
      const report = compose(join(work, `out-${seed}`), buildChannel('stable', seed, { ...stableFiles, [extra]: 'x' }), null);
      expect(report.problems.join('\n'), `${extra}`).toMatch(/reserved/);
    }
  });

  it('refuses a local test build', () => {
    const dir = join(work, 'local');
    mkdirSync(dir);
    writeFileSync(join(dir, 'index.html'), 'x');
    writeFileSync(
      join(dir, SITE_BUILD_FILE),
      JSON.stringify(createSiteBuildManifest(dir, { ...identity('stable', 'a'), localTest: true })),
    );
    expect(compose(join(work, 'out'), dir, null).problems.join('\n')).toMatch(/local test/);
  });

  it('refuses an output directory that is not empty', () => {
    const out = join(work, 'out');
    mkdirSync(out);
    writeFileSync(join(out, 'old.html'), 'x');
    expect(() => compose(out, buildChannel('stable', 'a', stableFiles), null)).toThrow(/empty/);
  });
});

describe('composeSite size budget (W12)', () => {
  it('warns from 750,000,000 and refuses from 900,000,000 unpacked bytes', () => {
    const stableDir = buildChannel('stable', 'a', stableFiles);
    const warn = composeSite({
      outDir: join(work, 'warn'),
      stable: { dir: stableDir, source: source('stable', 'a') },
      next: null,
      budget: { warn: 10, refuse: 10_000 },
    });
    expect(warn.budget.level).toBe('warn');
    expect(warn.problems).toEqual([]);
    const refuse = composeSite({
      outDir: join(work, 'refuse'),
      stable: { dir: stableDir, source: source('stable', 'a') },
      next: null,
      budget: { warn: 10, refuse: 20 },
    });
    expect(refuse.budget.level).toBe('refuse');
    expect(refuse.problems.join('\n')).toMatch(/budget/);
  });
});

describe('extractComposedChannel', () => {
  it('recovers each channel from a composed snapshot with its hash intact', () => {
    const stableDir = buildChannel('stable', 'a', stableFiles);
    const nextDir = buildChannel('next', '1', nextFiles);
    const out = join(work, 'out');
    compose(out, stableDir, nextDir);

    const stableBack = join(work, 'stable-back');
    const nextBack = join(work, 'next-back');
    const stableManifest = extractComposedChannel(out, '', stableBack);
    const nextManifest = extractComposedChannel(out, 'next/', nextBack);

    expect(stableManifest.contentHash).toBe(createSiteBuildManifest(stableDir, identity('stable', 'a')).contentHash);
    expect(nextManifest.channel).toBe('next');
    expect(existsSync(join(stableBack, 'next'))).toBe(false);
    expect(existsSync(join(stableBack, 'channels.json'))).toBe(false);
    expect(hashTreeFiles(nextBack)).toEqual(hashTreeFiles(nextDir));
  });
});

describe('buildChannelsDocument and parseChannelsDocument', () => {
  it('derives the pairing from both channel identities only', () => {
    const stableDir = buildChannel('stable', 'a', stableFiles);
    const nextDir = buildChannel('next', '1', nextFiles);
    const stable = createSiteBuildManifest(stableDir, identity('stable', 'a'));
    const next = createSiteBuildManifest(nextDir, identity('next', '1'));
    const first = buildChannelsDocument({
      stable: { manifest: stable, source: source('stable', 'a') },
      next: { manifest: next, source: source('next', '1') },
    });
    const again = buildChannelsDocument({
      stable: { manifest: stable, source: source('stable', 'a') },
      next: { manifest: next, source: source('next', '1') },
    });
    const stableOnly = buildChannelsDocument({ stable: { manifest: stable, source: source('stable', 'a') }, next: null });
    expect(first.pairing).toBe(again.pairing);
    expect(stableOnly.pairing).not.toBe(first.pairing);
    expect(parseChannelsDocument(JSON.parse(JSON.stringify(first)))).toEqual(first);
  });

  it('rejects a document without Stable or with a wrong path', () => {
    expect(() => parseChannelsDocument({ schemaVersion: 1, pairing: 'x', channels: { stable: null, next: null } })).toThrow(/stable/);
    expect(() => parseChannelsDocument(null)).toThrow();
  });
});

describe('findCrossChannelReferences (W01)', () => {
  it('flags a Next page that links deep into Stable, but not the explicit switch to the Stable root', () => {
    const dir = buildChannel('next', '2', {
      'ok.html': '<a href="/ExoJS/next/en/">x</a><a href="/ExoJS/">Stable</a>',
      'bad.html': '<script src="/ExoJS/_astro/app.js"></script><img src="/ExoJS/brand/x.svg">',
    });
    const hits = findCrossChannelReferences(dir, '/ExoJS/next/', '/ExoJS/');
    expect(hits.map(hit => hit.file)).toEqual(['bad.html', 'bad.html']);
  });
});
