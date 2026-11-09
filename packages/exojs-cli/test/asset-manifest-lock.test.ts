import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { withAssetManifestLock } from '../src/commands/assetManifestLock';

const ownerFile = '00000000-0000-4000-8000-000000000000.json';
let directory: string;
let manifest: string;
let lock: string;

const installOwner = (contents: string): void => {
  fs.mkdirSync(lock);
  fs.writeFileSync(join(lock, ownerFile), contents);
};

// Exercise the actual acquisition/refusal paths without spending ten seconds
// on each refused owner. No production timeout or filesystem call is replaced.
const expireWait = (): void => {
  let elapsed = 0;

  vi.spyOn(performance, 'now').mockImplementation(() => {
    elapsed += 10_000;

    return elapsed;
  });
};

beforeEach(() => {
  directory = fs.mkdtempSync(join(tmpdir(), 'exo-manifest-lock-'));
  manifest = join(directory, 'assets.json');
  lock = `${manifest}.lock`;
});

afterEach(() => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('asset manifest lock ownership', () => {
  test('keeps its owner record for the complete transaction and releases on failure', () => {
    const failure = new Error('publication failed');

    expect(() =>
      withAssetManifestLock(manifest, token => {
        expect(fs.readdirSync(lock)).toEqual([`${token}.json`]);
        expect(JSON.parse(fs.readFileSync(join(lock, `${token}.json`), 'utf8'))).toEqual({ pid: process.pid, hostname: hostname() });

        throw failure;
      }),
    ).toThrow(failure);
    expect(fs.readdirSync(directory)).toEqual([]);
    expect(withAssetManifestLock(manifest, () => 'next transaction')).toBe('next transaction');
    expect(fs.readdirSync(directory)).toEqual([]);
  });

  test('never expires a live owner, even when its marker is old', () => {
    const contents = JSON.stringify({ pid: process.pid, hostname: hostname() });

    installOwner(contents);
    fs.utimesSync(join(lock, ownerFile), 0, 0);
    fs.utimesSync(lock, 0, 0);
    expireWait();

    const write = vi.fn();

    expect(() => withAssetManifestLock(manifest, write)).toThrow(/timed out waiting/);
    expect(write).not.toHaveBeenCalled();
    expect(fs.readFileSync(join(lock, ownerFile), 'utf8')).toBe(contents);
    expect(fs.readdirSync(directory)).toEqual(['assets.json.lock']);
  });

  test('retains an owner whose process existence cannot be checked', () => {
    const contents = JSON.stringify({ pid: process.pid, hostname: hostname() });

    installOwner(contents);
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('access denied'), { code: 'EPERM' });
    });
    expireWait();

    expect(() => withAssetManifestLock(manifest, vi.fn())).toThrow(/timed out waiting/);
    expect(fs.readFileSync(join(lock, ownerFile), 'utf8')).toBe(contents);
  });

  test.each([
    ['another host', JSON.stringify({ pid: process.pid, hostname: `${hostname()}-other` })],
    ['malformed JSON', '{'],
    ['missing metadata', '{}'],
    ['a process group', JSON.stringify({ pid: 0, hostname: hostname() })],
    ['a negative PID', JSON.stringify({ pid: -1, hostname: hostname() })],
  ])('does not steal a lock with %s', (_description, contents) => {
    installOwner(contents);

    const probe = vi.spyOn(process, 'kill');
    const write = vi.fn();

    expireWait();
    expect(() => withAssetManifestLock(manifest, write)).toThrow(/timed out waiting/);
    expect(probe).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(fs.readFileSync(join(lock, ownerFile), 'utf8')).toBe(contents);
  });

  test('recovers an empty directory left after ownership was released', () => {
    fs.mkdirSync(lock);

    expect(withAssetManifestLock(manifest, () => 'published')).toBe('published');
    expect(fs.readdirSync(directory)).toEqual([]);
  });

  test('cleans a private candidate if its owner record cannot be written', () => {
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    });
    syncBuiltinESMExports();

    const write = vi.fn();

    expect(() => withAssetManifestLock(manifest, write)).toThrow(/cannot lock asset manifest/);
    expect(write).not.toHaveBeenCalled();
    expect(fs.readdirSync(directory)).toEqual([]);
  });
});
