import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Asset, coreAssetTypes, Loader } from '@codexo/exojs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { runAssetsPack } from '../src/commands/assetsPack';

let workDir: string;

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

const write = (name: string, contents: string | Uint8Array): string => {
  const path = join(workDir, name);

  writeFileSync(path, contents);

  return path;
};

const writeManifest = (manifest: unknown): string => write('pack.json', JSON.stringify(manifest));

/** Pack `manifest` and return the container bytes `exo assets pack` wrote. */
const pack = (manifest: unknown, argv: readonly string[] = []): ArrayBuffer => {
  const manifestPath = writeManifest(manifest);

  expect(runAssetsPack([manifestPath, ...argv])).toBe(0);

  const bytes = readFileSync(join(workDir, 'out.exoa'));

  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

/**
 * A loader carrying the built-in asset types, reading `container` as if it had
 * been fetched. This is the engine's own reader, which is the point: the writer
 * ships in a different package and may not import this one.
 *
 * `_installAssetTypes` is what `Application` construction calls; a bare loader
 * has no other way to receive the built-in types, and building an application
 * here would drag in a render backend the spec has no use for.
 */
const loaderReading = (container: ArrayBuffer): Loader => {
  const loader = new Loader({ basePath: '/' });

  loader._installAssetTypes(coreAssetTypes);
  global.fetch = vi.fn(async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', arrayBuffer: async () => container }) as unknown as Response);

  return loader;
};

const originalFetch = global.fetch;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'exo-pack-'));
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
  rmSync(workDir, { recursive: true, force: true });
});

// The container writer lives in `@codexo/exojs-build` and the reader in
// `@codexo/exojs`; neither package may depend on the other, so the header
// constants are stated on both sides. This spec is what makes them impossible
// to drift apart: it packs a real file with the CLI and reads it back through
// the engine's public `loader.loadContainer`.
describe('exo assets pack round trip', () => {
  test('a packed container loads back through the engine reader', async () => {
    write('level.json', '{"score":42}');
    write('readme.txt', 'hello world');

    const container = pack({
      output: 'out.exoa',
      assets: [
        { source: 'data/level.json', type: 'json', file: 'level.json' },
        { source: 'docs/readme.txt', type: 'text', file: 'readme.txt' },
      ],
    });

    const loader = loaderReading(container);
    await loader.loadContainer('assets/pack.exoa');

    expect(loader.get(Asset.type('json', 'data/level.json')).value).toEqual({ score: 42 });
    expect(loader.get(Asset.type('text', 'docs/readme.txt')).value).toBe('hello world');
  });

  test('--compress stores a compressible asset gzipped and reads it back byte for byte', async () => {
    const compressible = 'x'.repeat(4096);

    write('big.txt', compressible);

    const container = pack({ output: 'out.exoa', assets: [{ source: 'docs/big.txt', type: 'text', file: 'big.txt' }] }, ['--compress']);
    const { entries } = readIndex(container);

    expect(entries[0]).toMatchObject({ codec: 'gzip', decodedLength: compressible.length });
    expect(entries[0]!.length).toBeLessThan(compressible.length);

    const loader = loaderReading(container);
    await loader.loadContainer('assets/pack.exoa');

    expect(loader.get(Asset.type('text', 'docs/big.txt')).value).toBe(compressible);
  });

  test('--compress stores an incompressible asset as it is', async () => {
    // Random bytes stand in for PNG, KTX2, audio and video: gzip grows them,
    // so the writer must keep the plain bytes rather than wrap them twice.
    const random = new Uint8Array(2048);

    for (let i = 0; i < random.length; i++) random[i] = Math.floor(Math.random() * 256);

    write('noise.bin', random);

    const container = pack({ output: 'out.exoa', assets: [{ source: 'data/noise.bin', type: 'binary', file: 'noise.bin' }] }, ['--compress']);
    const { entries } = readIndex(container);

    expect(entries[0]!.codec).toBeUndefined();
    expect(entries[0]!.decodedLength).toBeUndefined();
    expect(entries[0]!.length).toBe(random.length);

    const loader = loaderReading(container);
    await loader.loadContainer('assets/pack.exoa');

    expect(new Uint8Array(loader.get(Asset.type('binary', 'data/noise.bin')).value)).toEqual(random);
  });

  test('every entry records a SHA-256 of the asset bytes, whatever the codec', async () => {
    write('big.txt', 'y'.repeat(4096));

    const plain = readIndex(pack({ output: 'out.exoa', assets: [{ source: 'docs/big.txt', type: 'text', file: 'big.txt' }] }));
    const gzipped = readIndex(pack({ output: 'out.exoa', assets: [{ source: 'docs/big.txt', type: 'text', file: 'big.txt' }] }, ['--compress']));

    expect(gzipped.entries[0]!.codec).toBe('gzip');
    expect(gzipped.entries[0]!.hash).toBe(plain.entries[0]!.hash);
    expect(gzipped.entries[0]!.hash).toMatch(/^[\da-f]{64}$/);
  });

  test('rejects a payload that does not decode to its declared decodedLength', async () => {
    write('big.txt', 'z'.repeat(4096));

    const container = pack({ output: 'out.exoa', assets: [{ source: 'docs/big.txt', type: 'text', file: 'big.txt' }] }, ['--compress']);
    const corrupted = withIndex(container, entries => entries.map(entry => ({ ...entry, decodedLength: (entry.decodedLength as number) - 1 })));
    const loader = loaderReading(corrupted);

    await expect(loader.loadContainer('assets/pack.exoa')).rejects.toThrow(/"decodedLength"/);
  });

  test('rejects a version 2 container and names the command that rebuilds it', async () => {
    write('level.json', '{"score":42}');

    const container = pack({ output: 'out.exoa', assets: [{ source: 'data/level.json', type: 'json', file: 'level.json' }] });

    new DataView(container).setUint32(4, 2, true);

    const loader = loaderReading(container);

    await expect(loader.loadContainer('assets/pack.exoa')).rejects.toThrow(/unsupported version 2/);
    await expect(loader.loadContainer('assets/pack.exoa')).rejects.toThrow(/exo assets pack/);
  });
});

describe('exo assets pack failures', () => {
  test('a missing manifest argument says what to pass', () => {
    expect(() => runAssetsPack([])).toThrow('a manifest path is required');
  });

  test('an unreadable manifest names the path', () => {
    expect(() => runAssetsPack([join(workDir, 'absent.json')])).toThrow(/cannot read manifest ".*absent\.json"/);
  });

  test('a manifest that is not JSON says so', () => {
    expect(() => runAssetsPack([write('pack.json', '{not json')])).toThrow(/is not valid JSON/);
  });

  test('a manifest without an output is rejected', () => {
    expect(() => runAssetsPack([writeManifest({ assets: [] })])).toThrow(/needs a non-empty string "output"/);
  });

  test('a manifest without an assets array is rejected', () => {
    expect(() => runAssetsPack([writeManifest({ output: 'out.exoa' })])).toThrow(/needs an "assets" array/);
  });

  test('an asset entry missing a field names the field and the entry index', () => {
    const manifest = { output: 'out.exoa', assets: [{ source: 'a', type: 'json' }] };

    expect(() => runAssetsPack([writeManifest(manifest)])).toThrow(/asset 0 needs a non-empty string "file"/);
  });

  test('an asset file that cannot be read names the source it belongs to', () => {
    const manifest = { output: 'out.exoa', assets: [{ source: 'data/gone.json', type: 'json', file: 'gone.json' }] };

    expect(() => runAssetsPack([writeManifest(manifest)])).toThrow('cannot read "gone.json" for "data/gone.json"');
  });
});

/** The index of a written container, read back the way the engine reads it. */
const readIndex = (container: ArrayBuffer): { entries: Record<string, unknown>[]; indexLength: number } => {
  const indexLength = new DataView(container).getUint32(8, true);
  const entries = JSON.parse(new TextDecoder().decode(new Uint8Array(container, 12, indexLength))) as Record<string, unknown>[];

  return { entries, indexLength };
};

/** Rewrite a container's index, keeping the header and the data section intact. */
const withIndex = (container: ArrayBuffer, transform: (entries: Record<string, unknown>[]) => Record<string, unknown>[]): ArrayBuffer => {
  const { entries, indexLength } = readIndex(container);
  const rewritten = utf8(JSON.stringify(transform(entries)));
  const data = new Uint8Array(container, 12 + indexLength);
  const buffer = new ArrayBuffer(12 + rewritten.byteLength + data.byteLength);
  const bytes = new Uint8Array(buffer);

  bytes.set(new Uint8Array(container, 0, 12));
  new DataView(buffer).setUint32(8, rewritten.byteLength, true);
  bytes.set(rewritten, 12);
  bytes.set(data, 12 + rewritten.byteLength);

  return buffer;
};
