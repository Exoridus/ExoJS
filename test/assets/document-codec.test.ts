/**
 * Versioned documents through the real acquisition path: Loader, AssetDecoder,
 * AssetCache and a cache store. A document asset is an ordinary asset type whose
 * codec is a `DocumentCodec`; nothing in the loader or cache knows about
 * document versions.
 */

import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, test, vi } from 'vitest';

import { AssetDecodeError } from '#assets/AssetDecodeError';
import type { AssetType } from '#assets/AssetType';
import { AssetCache } from '#assets/cache/AssetCache';
import { serializeCacheRecordKey } from '#assets/cache/CacheRecordKey';
import { DocumentCodec } from '#assets/DocumentCodec';
import { Loader } from '#assets/Loader';
import { DocumentVersionError } from '#core/document/documentErrors';
import { materializeAssetTypes } from '#extensions/materialize';

import { type Atlas, AtlasAssetType, atlasHistoryAt } from './atlas-document-pilot';
import { createCacheStoreDouble } from './cache-test-doubles';

const text = (name: string): string => readFileSync(`test/fixtures/documents/${name}.json`, 'utf8');

const { $type: _type, $version: _version, ...currentBody } = JSON.parse(text('atlas-v3')) as Record<string, unknown>;

/** The one file the server currently serves, and how often it was requested. */
const server = { body: '', requests: 0 };

const serve = (body: string): void => {
  server.body = body;
  server.requests = 0;
  global.fetch = vi.fn(async () => {
    server.requests++;

    return { ok: true, status: 200, statusText: 'OK', text: async () => server.body } as unknown as Response;
  }) as unknown as typeof fetch;
};

/** A loader of one application release, sharing `cache` with every other release. */
const createLoader = (cache: AssetCache, type: AssetType<never, never, never, never>): Loader => {
  const loader = new Loader({ basePath: 'https://assets.test/', cache });

  materializeAssetTypes(loader, [type as never]);

  return loader;
};

const load = async (loader: Loader, type: AtlasAssetType): Promise<Atlas> => loader.load(type.asset('ui.atlas.json'));

describe('a versioned document through Loader, AssetDecoder and AssetCache', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test.each(['atlas-v1', 'atlas-v2', 'atlas-v3'])('builds the current resource from the %s file', async name => {
    serve(text(name));

    const type = new AtlasAssetType();
    const loader = createLoader(new AssetCache({ stores: createCacheStoreDouble() }), type as never);

    expect((await load(loader, type)).document).toEqual(currentBody);
    loader.destroy();
  });

  test('a release with a newer document version reads the record an older release cached: no request, no new record', async () => {
    const store = createCacheStoreDouble();
    const cache = new AssetCache({ stores: store });

    serve(text('atlas-v1'));

    const oldRelease = new AtlasAssetType(atlasHistoryAt(1));
    const first = createLoader(cache, oldRelease as never);

    await load(first, oldRelease);
    first.destroy();

    const newRelease = new AtlasAssetType(atlasHistoryAt(3));
    const second = createLoader(cache, newRelease as never);

    expect((await load(second, newRelease)).document).toEqual(currentBody);
    second.destroy();

    expect(server.requests).toBe(1);
    expect(store.records.size).toBe(1);

    const [[key, stored]] = [...store.records];

    expect(key).toBe(
      serializeCacheRecordKey({
        namespace: 'atlas',
        source: 'url:https://assets.test/ui.atlas.json',
        version: newRelease.layout.version,
        record: 'value',
      }),
    );
    expect(stored).toBe(text('atlas-v1'));
  });

  test('an older release refuses a record written by a newer one instead of misreading it', async () => {
    const cache = new AssetCache({ stores: createCacheStoreDouble() });

    serve(text('atlas-v3'));

    const newRelease = new AtlasAssetType(atlasHistoryAt(3));
    const first = createLoader(cache, newRelease as never);

    await load(first, newRelease);
    first.destroy();

    const oldRelease = new AtlasAssetType(atlasHistoryAt(2));
    const second = createLoader(cache, oldRelease as never);
    const error = await load(second, oldRelease).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AssetDecodeError);
    expect(((error as AssetDecodeError).cause as AssetDecodeError).cause).toBeInstanceOf(DocumentVersionError);
    expect(((error as AssetDecodeError).cause as AssetDecodeError).cause).toMatchObject({ reason: 'newer', found: 3 });
    expect(server.requests).toBe(1);
    second.destroy();
  });

  test.each([
    ['malformed JSON', '{"$type":"atlas"', /Unexpected|JSON|Expected/],
    ['a foreign $type', JSON.stringify({ $type: 'sprite', $version: 3 }), /type "atlas", got "sprite"/],
    ['a missing $version', JSON.stringify({ $type: 'atlas', pages: [], frames: [] }), /not a positive integer/],
    [
      'a body the parser rejects',
      JSON.stringify({ $type: 'atlas', $version: 3, density: 1, pages: [{ $type: 'sound', source: 'a.ogg' }], frames: [] }),
      /pages\[0\] must be a texture reference/,
    ],
  ])('reports %s as an AssetDecodeError naming the type and the file', async (_label, body, reason) => {
    serve(body);

    const type = new AtlasAssetType();
    const loader = createLoader(new AssetCache({ stores: createCacheStoreDouble() }), type as never);
    const error = await load(loader, type).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AssetDecodeError);
    expect(error).toMatchObject({ assetType: 'atlas' });
    expect((error as Error).message).toContain('ui.atlas.json');
    expect((error as Error).message).toMatch(reason);
    loader.destroy();
  });

  test('keeps the typed invalid-version cause through the loader', async () => {
    serve('{"$type":"atlas","$version":{"toString":0}}');
    const type = new AtlasAssetType();
    const loader = createLoader(new AssetCache({ stores: createCacheStoreDouble() }), type as never);

    try {
      const error = await load(loader, type).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AssetDecodeError);
      const codecError = (error as AssetDecodeError).cause;
      expect(codecError).toBeInstanceOf(AssetDecodeError);
      const versionError = (codecError as AssetDecodeError).cause;
      expect(versionError).toBeInstanceOf(DocumentVersionError);
      expect(versionError).toMatchObject({ reason: 'invalid', found: { toString: 0 } });
    } finally {
      loader.destroy();
    }
  });

  test('reads a document from container bytes exactly as from a response', async () => {
    const codec = new DocumentCodec(atlasHistoryAt(3));
    const bytes = new TextEncoder().encode(text('atlas-v2')).buffer;

    expect(await codec.decode(await codec.fromBytes(bytes))).toEqual(currentBody);
  });
});
