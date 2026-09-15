import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { runAssetsPack } from '../src/commands/assetsPack';

let workDir: string;

const write = (name: string, contents: string | Uint8Array): string => {
  const path = join(workDir, name);

  writeFileSync(path, contents);

  return path;
};

const description = (value: unknown, file = 'pack.json'): string => write(file, JSON.stringify(value));

const readManifest = (name = 'assets.json'): Record<string, unknown> => JSON.parse(readFileSync(join(workDir, name), 'utf8')) as Record<string, unknown>;

const packs = (name?: string): Record<string, Record<string, unknown>> => readManifest(name).packs as Record<string, Record<string, unknown>>;

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** Pack `value` into a manifest, returning the manifest's record for the single pack it holds. */
const packOne = (value: unknown, manifest = 'assets.json'): Record<string, unknown> => {
  expect(runAssetsPack([description(value), '--manifest', join(workDir, manifest)])).toBe(0);

  const records = Object.values(packs(manifest));

  expect(records).toHaveLength(1);

  return records[0]!;
};

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'exo-manifest-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('exo assets pack --manifest', () => {
  test('writes the pack under a content-addressed name and a manifest that describes it', () => {
    write('level.json', '{"score":42}');
    write('readme.txt', 'hello world');

    const record = packOne({
      output: 'level1.exoa',
      assets: [
        { source: 'data/level.json', type: 'json', file: 'level.json' },
        { source: 'docs/readme.txt', type: 'text', file: 'readme.txt' },
      ],
    });

    const bytes = readFileSync(join(workDir, record.file as string));

    expect(readManifest().version).toBe(1);
    expect(Object.keys(packs())).toEqual(['level1']);
    expect(record.file).toMatch(/^level1\.[\da-f]{16}\.exoa$/);
    expect(record.hash).toBe(sha256(bytes));
    expect(record.file).toBe(`level1.${(record.hash as string).slice(0, 16)}.exoa`);
    expect(record.byteLength).toBe(bytes.byteLength);
    expect(record.blockCount).toBe(1);
    expect(record.entries).toEqual(['data/level.json', 'docs/readme.txt']);
  });

  test('changing one asset changes the pack name and the manifest points at the new file', () => {
    write('level.json', '{"score":42}');

    const value = { output: 'level1.exoa', assets: [{ source: 'data/level.json', type: 'json', file: 'level.json' }] };
    const first = packOne(value);

    write('level.json', '{"score":43}');

    const second = packOne(value);

    expect(second.file).not.toBe(first.file);
    expect(second.hash).not.toBe(first.hash);
    // The superseded pack stays: a deployment still serving the old manifest is
    // still handing out the old name.
    expect(existsSync(join(workDir, first.file as string))).toBe(true);
    expect(existsSync(join(workDir, second.file as string))).toBe(true);
    expect(Object.keys(packs())).toEqual(['level1']);
  });

  test('a second pack merges into the same manifest, in name order', () => {
    write('a.json', '{"a":1}');
    write('b.json', '{"b":2}');

    const manifest = join(workDir, 'assets.json');

    expect(
      runAssetsPack([description({ output: 'ui.exoa', assets: [{ source: 'a.json', type: 'json', file: 'a.json' }] }, 'ui.json'), '--manifest', manifest]),
    ).toBe(0);
    expect(
      runAssetsPack([description({ output: 'boot.exoa', assets: [{ source: 'b.json', type: 'json', file: 'b.json' }] }, 'boot.json'), '--manifest', manifest]),
    ).toBe(0);

    expect(Object.keys(packs())).toEqual(['boot', 'ui']);
  });

  test('a "name" in the pack description names the pack instead of the output stem', () => {
    write('a.json', '{"a":1}');

    packOne({ name: 'chapter-one', output: 'level1.exoa', assets: [{ source: 'a.json', type: 'json', file: 'a.json' }] });

    expect(Object.keys(packs())).toEqual(['chapter-one']);
    expect(packs()['chapter-one']!.file).toMatch(/^chapter-one\.[\da-f]{16}\.exoa$/);
  });

  test('the manifest addresses a pack in a subdirectory relative to itself', () => {
    write('a.json', '{"a":1}');
    mkdirSync(join(workDir, 'packs'));

    const record = packOne({ output: 'packs/level1.exoa', assets: [{ source: 'a.json', type: 'json', file: 'a.json' }] });

    expect(record.file).toMatch(/^packs\/level1\.[\da-f]{16}\.exoa$/);
    expect(existsSync(join(workDir, record.file as string))).toBe(true);
  });

  test('without the flag the output path is written verbatim and no manifest appears', () => {
    write('a.json', '{"a":1}');

    expect(runAssetsPack([description({ output: 'out.exoa', assets: [{ source: 'a.json', type: 'json', file: 'a.json' }] })])).toBe(0);
    expect(readdirSync(workDir).filter(name => name.endsWith('.exoa'))).toEqual(['out.exoa']);
    expect(existsSync(join(workDir, 'assets.json'))).toBe(false);
  });
});

describe('exo assets pack --manifest failures', () => {
  test('refuses a manifest written by a version this tool does not know', () => {
    write('a.json', '{"a":1}');
    write('assets.json', JSON.stringify({ version: 99, packs: {} }));

    const args = [
      description({ output: 'level1.exoa', assets: [{ source: 'a.json', type: 'json', file: 'a.json' }] }),
      '--manifest',
      join(workDir, 'assets.json'),
    ];

    expect(() => runAssetsPack(args)).toThrow(/manifest version 99/);
  });

  test('refuses a manifest that is not a manifest', () => {
    write('a.json', '{"a":1}');
    write('assets.json', '[]');

    const args = [
      description({ output: 'level1.exoa', assets: [{ source: 'a.json', type: 'json', file: 'a.json' }] }),
      '--manifest',
      join(workDir, 'assets.json'),
    ];

    expect(() => runAssetsPack(args)).toThrow(/is not an asset manifest/);
  });

  test('refuses to address a pack that does not sit under the manifest directory', () => {
    write('a.json', '{"a":1}');
    mkdirSync(join(workDir, 'deploy'));

    const args = [
      description({ output: 'level1.exoa', assets: [{ source: 'a.json', type: 'json', file: 'a.json' }] }),
      '--manifest',
      join(workDir, 'deploy/assets.json'),
    ];

    expect(() => runAssetsPack(args)).toThrow(/outside the manifest directory/);
  });

  test('a manifest option with no value says so', () => {
    write('a.json', '{"a":1}');

    expect(() => runAssetsPack([description({ output: 'out.exoa', assets: [] }), '--manifest'])).toThrow(/option "--manifest" expects a value/);
  });
});
