import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Asset, coreAssetTypes, Loader } from '@codexo/exojs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { runAssetsPack } from '../src/commands/assetsPack';

let workDir: string;

const write = (name: string, contents: string | Uint8Array): string => {
  const path = join(workDir, name);

  writeFileSync(path, contents);

  return path;
};

const writeManifest = (manifest: unknown): string => write('pack.json', JSON.stringify(manifest));

/** Pack `manifest` and return the container bytes `exo assets pack` wrote. */
const pack = (manifest: unknown): ArrayBuffer => {
  const manifestPath = writeManifest(manifest);

  expect(runAssetsPack([manifestPath])).toBe(0);

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

  test('a compressible pack is stored deflated and reads back byte for byte', async () => {
    const compressible = 'x'.repeat(4096);

    write('big.txt', compressible);

    const container = pack({ output: 'out.exoa', assets: [{ source: 'docs/big.txt', type: 'text', file: 'big.txt' }] });
    const { blocks } = readHead(container);

    expect(blocks[0]).toMatchObject({ codec: 'deflate-raw' });
    expect(blocks[0]!.storedLength as number).toBeLessThan(compressible.length);

    const loader = loaderReading(container);
    await loader.loadContainer('assets/pack.exoa');

    expect(loader.get(Asset.type('text', 'docs/big.txt')).value).toBe(compressible);
  });

  test('an incompressible pack is stored as it is', async () => {
    // Random bytes stand in for PNG, KTX2, audio and video: deflate grows them,
    // so the writer must keep the plain bytes rather than wrap them twice.
    const random = new Uint8Array(2048);

    for (let i = 0; i < random.length; i++) random[i] = Math.floor(Math.random() * 256);

    write('noise.bin', random);

    const container = pack({ output: 'out.exoa', assets: [{ source: 'data/noise.bin', type: 'binary', file: 'noise.bin' }] });
    const { blocks } = readHead(container);

    expect(blocks[0]).toMatchObject({ codec: 'none', length: random.length, storedLength: random.length });

    const loader = loaderReading(container);
    await loader.loadContainer('assets/pack.exoa');

    expect(new Uint8Array(loader.get(Asset.type('binary', 'data/noise.bin')).value)).toEqual(random);
  });

  test('every entry records a SHA-256 of the asset bytes', () => {
    write('big.txt', 'y'.repeat(4096));

    const { entries } = readHead(pack({ output: 'out.exoa', assets: [{ source: 'docs/big.txt', type: 'text', file: 'big.txt' }] }));

    expect(entries[0]!.hash).toMatch(/^[\da-f]{64}$/);
  });

  test('rejects a truncated container instead of decoding part of it', async () => {
    write('big.txt', 'z'.repeat(4096));

    const container = pack({ output: 'out.exoa', assets: [{ source: 'docs/big.txt', type: 'text', file: 'big.txt' }] });
    const loader = loaderReading(container.slice(0, container.byteLength - 8));

    await expect(loader.loadContainer('assets/pack.exoa')).rejects.toThrow(/block 0 runs past the container/);
  });

  test('rejects an earlier container version and names the command that rebuilds it', async () => {
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

  test('the command takes no options', () => {
    write('level.json', '{}');

    const manifest = { output: 'out.exoa', assets: [{ source: 'data/level.json', type: 'json', file: 'level.json' }] };

    expect(() => runAssetsPack([writeManifest(manifest), '--compress'])).toThrow(/unknown option "--compress"/);
  });
});

interface ContainerHead {
  readonly entries: Record<string, unknown>[];
  readonly blocks: Record<string, unknown>[];
}

/** The JSON head of a written container, read straight out of the file the CLI produced. */
const readHead = (container: ArrayBuffer): ContainerHead => {
  const headLength = new DataView(container).getUint32(12, true);

  return JSON.parse(new TextDecoder().decode(new Uint8Array(container, 32, headLength))) as ContainerHead;
};
