/**
 * `Loader.stats()` - the aggregate counterpart to `Loader.inspect()`.
 *
 * Types here acquire nothing, so a case controls exactly which payload shape
 * ends up resident and no network sits between the request and the assertion.
 */

import { Asset } from '#assets/Asset';
import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader } from '#assets/Loader';
import { residentBytes } from '#assets/residentBytes';
import { materializeAssetTypes } from '#extensions/materialize';

import { testAssetType } from './test-asset-type';

const makeLoader = (types: Parameters<typeof materializeAssetTypes>[1]): Loader => {
  const loader = new Loader({ basePath: '/' });

  materializeAssetTypes(loader, types);

  return loader;
};

/** A type that acquires nothing and hands back whatever `resource` produces for the requested source. */
const payloadType = (id: string, resource: (source: string) => unknown) =>
  testAssetType<string, unknown>({ id, acquires: false, create: async (_source, context) => resource(context.source) });

// The ad-hoc types these cases install, declared so `new Asset({ type })`
// resolves them the way an application's own types would.
declare module '#assets/AssetDefinitions' {
  interface AssetDefinitions {
    bytes: { resource: unknown; config: { source: string } };
    pixels: { resource: unknown; config: { source: string } };
    json: { resource: unknown; config: { source: string } };
  }
}

describe('residentBytes', () => {
  test('measures the payload shapes a loader can size', () => {
    expect(residentBytes('abcd')).toBe(8);
    expect(residentBytes(new ArrayBuffer(64))).toBe(64);
    expect(residentBytes(new Uint16Array(10))).toBe(20);
    expect(residentBytes({ width: 4, height: 8 })).toBe(128);
    expect(residentBytes({ length: 100, numberOfChannels: 2 })).toBe(800);
    expect(residentBytes({ audioBuffer: { length: 100, numberOfChannels: 1 } })).toBe(400);
  });

  test('reports zero for a payload whose size the runtime cannot read', () => {
    expect(residentBytes({ parsed: true, items: [1, 2, 3] })).toBe(0);
    expect(residentBytes(null)).toBe(0);
    expect(residentBytes(undefined)).toBe(0);
    expect(residentBytes(42)).toBe(0);
    // Dimensions have to be usable numbers, not merely present.
    expect(residentBytes({ width: 0, height: 8 })).toBe(0);
    expect(residentBytes({ width: Number.NaN, height: 8 })).toBe(0);
  });
});

describe('Loader.stats', () => {
  test('an empty loader reports zeroes and no rows', () => {
    const loader = makeLoader([payloadType('bytes', () => new ArrayBuffer(1))]);

    expect(loader.stats()).toEqual({ ready: 0, pending: 0, failed: 0, bytes: 0, byType: [], largest: [] });
    loader.destroy();
  });

  test('counts resident assets and their estimated bytes per type', async () => {
    const loader = makeLoader([payloadType('bytes', () => new ArrayBuffer(1024)), payloadType('pixels', () => ({ width: 64, height: 64 }))]);

    await loader.load(new Asset({ type: 'bytes', source: 'a.dat' }));
    await loader.load(new Asset({ type: 'bytes', source: 'b.dat' }));
    await loader.load(new Asset({ type: 'pixels', source: 'c.dat' }));

    const stats = loader.stats();

    expect(stats.ready).toBe(3);
    expect(stats.pending).toBe(0);
    expect(stats.failed).toBe(0);
    expect(stats.bytes).toBe(1024 * 2 + 64 * 64 * 4);
    // Heaviest type first: 16 KiB of pixels outweighs 2 KiB of buffers.
    expect(stats.byType).toEqual([
      { type: 'pixels', ready: 1, pending: 0, failed: 0, bytes: 16384 },
      { type: 'bytes', ready: 2, pending: 0, failed: 0, bytes: 2048 },
    ]);
    loader.destroy();
  });

  test('a failed fetch is counted as failed, not as ready or pending', async () => {
    const originalFetch = global.fetch;

    global.fetch = vi.fn(async (): Promise<Response> => ({ ok: false, status: 404, statusText: 'Not Found' }) as Response);

    const loader = new Loader();

    materializeAssetTypes(loader, coreAssetTypes);

    const ref = loader.get('missing.json');

    await expect(ref.loaded).rejects.toThrow();

    const stats = loader.stats();

    expect(stats.failed).toBe(1);
    expect(stats.ready).toBe(0);
    expect(stats.byType).toEqual([{ type: 'json', ready: 0, pending: 0, failed: 1, bytes: 0 }]);

    loader.destroy();
    global.fetch = originalFetch;
  });

  test('the ready/pending/failed split always matches what inspect() reports', async () => {
    const loader = makeLoader([payloadType('bytes', () => new ArrayBuffer(64))]);

    await loader.load(new Asset({ type: 'bytes', source: 'a.dat' }));

    const rows = loader.inspect();
    const stats = loader.stats();

    expect(stats.ready).toBe(rows.filter(row => row.state === 'ready').length);
    expect(stats.failed).toBe(rows.filter(row => row.state === 'failed').length);
    expect(stats.ready + stats.pending + stats.failed).toBe(rows.length);
    loader.destroy();
  });

  test('lists the heaviest resident assets, largest first, capped at the requested count', async () => {
    const sizes = new Map([
      ['small.dat', 16],
      ['medium.dat', 4096],
      ['large.dat', 65536],
    ]);
    const loader = makeLoader([payloadType('bytes', url => new ArrayBuffer(sizes.get(url) ?? 1))]);

    for (const source of ['small.dat', 'medium.dat', 'large.dat']) {
      await loader.load(new Asset({ type: 'bytes', source }));
    }

    expect(loader.stats(2).largest.map(row => row.bytes)).toEqual([65536, 4096]);
    expect(loader.stats().largest).toHaveLength(3);
    expect(loader.stats().largest[0]?.type).toBe('bytes');
    loader.destroy();
  });

  test('an unmeasurable payload is ready and counted, but never appears among the largest', async () => {
    const loader = makeLoader([payloadType('json', () => ({ parsed: true }))]);

    await loader.load(new Asset({ type: 'json', source: 'a.json' }));

    const stats = loader.stats();

    expect(stats.ready).toBe(1);
    expect(stats.bytes).toBe(0);
    expect(stats.largest).toEqual([]);
    loader.destroy();
  });

  test('the snapshot is frozen, so nothing handed out can be written back into residency', async () => {
    const loader = makeLoader([payloadType('bytes', () => new ArrayBuffer(32))]);

    await loader.load(new Asset({ type: 'bytes', source: 'a.dat' }));

    const stats = loader.stats();

    expect(Object.isFrozen(stats)).toBe(true);
    expect(Object.isFrozen(stats.byType)).toBe(true);
    expect(Object.isFrozen(stats.byType[0])).toBe(true);
    expect(Object.isFrozen(stats.largest[0])).toBe(true);
    loader.destroy();
  });
});
