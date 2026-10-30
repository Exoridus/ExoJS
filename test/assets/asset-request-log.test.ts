/**
 * The request log's aliases.
 *
 * `AssetResidency` documents `aliases` as every source string seen for one
 * canonical resource, and its whole purpose is the case where a spelling other
 * than the fetched one names the same asset. Variant selection is exactly that
 * case: the caller wrote one source and the loader fetched another. Recording
 * only the fetched source dropped the spelling the caller used, so diagnostics
 * and tooling listed the variant path and never the logical name.
 */
import { Asset } from '#assets/Asset';
import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader } from '#assets/Loader';
import { materializeAssetTypes } from '#extensions/materialize';

const originalFetch = global.fetch;

const mockFetch = (body = 'payload'): void => {
  global.fetch = vi.fn(
    async (): Promise<Response> =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => body,
        json: async () => JSON.parse(body),
        arrayBuffer: async () => new TextEncoder().encode(body).buffer,
        blob: async () => new Blob([body]),
      }) as unknown as Response,
  ) as unknown as typeof fetch;
};

const createLoader = (): Loader => {
  const loader = new Loader({ basePath: '/' });

  materializeAssetTypes(loader, coreAssetTypes);

  return loader;
};

afterEach(() => {
  global.fetch = originalFetch;
});

describe('AssetRequestLog aliases', () => {
  test('records the requested and the selected source when a variant replaced it', async () => {
    const loader = createLoader();

    loader.variants.define('notes.txt', [{ source: 'notes.en.txt' }]);
    mockFetch();

    await loader.load(Asset.type('text', 'notes.txt'));

    const [row] = loader.inspect();

    expect(row?.aliases).toEqual(['notes.en.txt', 'notes.txt']);

    loader.destroy();
  });

  test('records one alias when the requested source is the fetched one', async () => {
    const loader = createLoader();

    mockFetch();

    await loader.load(Asset.type('text', 'notes.txt'));

    const [row] = loader.inspect();

    expect(row?.aliases).toEqual(['notes.txt']);

    loader.destroy();
  });
});
