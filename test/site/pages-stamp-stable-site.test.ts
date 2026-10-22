import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { verifyChannelTree } from '../../scripts/pages/channel-artifact';
import { SITE_BUILD_FILE } from '../../scripts/pages/site-manifest';
import { stampStableSite } from '../../scripts/pages/stamp-stable-site';

/**
 * The Stable site build writes no manifest of its own; the stamp records the
 * finished tree so it passes the same candidate verification as a channel
 * build, and refuses anything that is not a Stable tree.
 */

const SHA = 'a'.repeat(40);

let work: string;

const options = (dir: string) => ({ dir, sourceSha: SHA, packageVersion: '0.19.1', createdAt: '2026-10-22T12:00:00.000Z' });

const buildTree = (entry = '<link href="/ExoJS/favicon.svg">'): string => {
  const dir = join(work, 'tree');
  mkdirSync(join(dir, 'en'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), entry);
  writeFileSync(join(dir, 'en', 'index.html'), '<p>home</p>');

  return dir;
};

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'exojs-stamp-'));
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

describe('stampStableSite', () => {
  it('records a tree that passes the Stable candidate verification', () => {
    const dir = buildTree();

    stampStableSite(options(dir));
    const { problems, manifest } = verifyChannelTree(dir, { channel: 'stable', sourceSha: SHA });

    expect(problems).toEqual([]);
    expect(manifest?.basePath).toBe('/ExoJS/');
    expect(manifest?.files.map(file => file.path)).toEqual(['en/index.html', 'index.html']);
  });

  it('refuses a tree that already carries a manifest', () => {
    const dir = buildTree();
    writeFileSync(join(dir, SITE_BUILD_FILE), '{}');

    expect(() => stampStableSite(options(dir))).toThrow(/already exists/);
  });

  it('refuses a tree without an entry page', () => {
    const dir = join(work, 'empty');
    mkdirSync(dir);

    expect(() => stampStableSite(options(dir))).toThrow(/no index\.html/);
  });

  it('refuses a tree rendered for another base', () => {
    const dir = buildTree('<link href="/elsewhere/favicon.svg">');

    expect(() => stampStableSite(options(dir))).toThrow(/Stable base/);
  });
});
