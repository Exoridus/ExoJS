import { materializeAssetBindings } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';
import { Assets } from '#resources/Assets';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader } from '#resources/Loader';

/** Loader with all core asset bindings (mirrors createCoreLoader in the sibling adopt/background specs). */
function createCoreLoader(): Loader {
  const loader = new Loader();
  materializeAssetBindings(loader, coreAssetBindings);
  return loader;
}

const originalFetch = global.fetch;

const mockFetchImage = (): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn(
    async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', arrayBuffer: async () => new ArrayBuffer(8) }) as unknown as Response,
  );

  global.fetch = fetchMock as typeof fetch;

  return fetchMock;
};

const mockFetchJson = (payload: unknown): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn(
    async (): Promise<Response> =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => payload,
        text: async () => JSON.stringify(payload),
        arrayBuffer: async () => new ArrayBuffer(0),
      }) as unknown as Response,
  );

  global.fetch = fetchMock as typeof fetch;

  return fetchMock;
};

/** Alias-keyed queue probe — avoids coupling the assertions to token identity. */
const isQueued = (loader: Loader, alias: string): boolean =>
  (loader as unknown as { _backgroundQueue: Array<{ alias: string }> })._backgroundQueue.some(e => e.alias === alias);

describe('load(target, { background: true })', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 4, height: 4 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  test('claims + queues each catalog leaf instead of fetching immediately, then heals in place on drain', async () => {
    const fetchMock = mockFetchImage();
    const loader = createCoreLoader();

    loader.setConcurrency(0); // park the queue so the divert is observable

    const catalog = new Assets({ ship: { type: 'texture', source: 'ship.png' } });
    loader.load(catalog, { background: true });

    // Adopted (registered + claimed) but NOT fetched — the leaf sits in the background queue.
    expect(catalog.ship.loadState).toBe('loading');
    expect(isQueued(loader, 'ship.png')).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    loader.setConcurrency(6);
    await loader.loadAll();

    expect(catalog.ship.loadState).toBe('ready');
    expect(catalog.ship.width).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The loader's own get() for the same source resolves to the adopted, healed leaf.
    expect(loader.get(Texture, 'ship.png')).toBe(catalog.ship);
  });

  test('get() on a background-queued source boosts it past the parked queue and heals the SAME leaf', async () => {
    const fetchMock = mockFetchImage();
    const loader = createCoreLoader();

    loader.setConcurrency(0); // keep the queue parked so boost is observable

    const catalog = new Assets({
      ship: { type: 'texture', source: 'ship.png' },
      logo: { type: 'texture', source: 'logo.png' },
    });
    loader.load(catalog, { background: true });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(isQueued(loader, 'ship.png')).toBe(true);

    const ship = loader.get(Texture, 'ship.png'); // boosts ship past the parked queue

    await expect(ship.loaded).resolves.toBe(ship);
    expect(ship).toBe(catalog.ship); // the adopted handle healed, not a new instance
    expect(ship.loadState).toBe('ready');
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the boosted source fetched so far
    expect(isQueued(loader, 'ship.png')).toBe(false); // dequeued by the boost
    expect(isQueued(loader, 'logo.png')).toBe(true); // logo stays parked
  });

  test('foreground load(catalog) (no option) still fetches immediately — unchanged', async () => {
    const fetchMock = mockFetchImage();
    const loader = createCoreLoader();

    loader.setConcurrency(0); // background parked, but the foreground path ignores concurrency

    const catalog = new Assets({ ship: { type: 'texture', source: 'ship.png' } });
    loader.load(catalog);

    expect(isQueued(loader, 'ship.png')).toBe(false);

    await catalog.ship.loaded; // resolves despite concurrency 0 → it never touched the queue
    expect(catalog.ship.loadState).toBe('ready');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('onProgress reports across a background catalog load', async () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const ticks: Array<[number, number]> = [];

    loader.onProgress.add((loaded, total) => ticks.push([loaded, total]));
    loader.load(Assets.from({ ship: 'ship.png', logo: 'logo.png' }), { background: true });
    await loader.loadAll();

    expect(ticks.at(-1)).toEqual([2, 2]);
  });

  test('a value leaf (json) in a background catalog also defers then fills in place', async () => {
    const fetchMock = mockFetchJson({ hp: 9 });
    const loader = createCoreLoader();

    loader.setConcurrency(0);

    const catalog = new Assets({ config: { type: 'json', source: 'cfg.json' } });
    loader.load(catalog, { background: true });

    expect(catalog.config.loadState).toBe('loading');
    expect(isQueued(loader, 'cfg.json')).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    loader.setConcurrency(6);
    await loader.loadAll();

    expect(catalog.config.loadState).toBe('ready');
    expect(catalog.config.value).toEqual({ hp: 9 });
  });

  test('releasing a background-queued catalog at refcount 0 drops the entry from the queue', async () => {
    mockFetchImage();
    const loader = createCoreLoader();

    loader.setConcurrency(0);

    const catalog = new Assets({ ship: { type: 'texture', source: 'ship.png' } });
    loader.load(catalog, { background: true });

    expect(isQueued(loader, 'ship.png')).toBe(true);

    loader.release(catalog.ship); // last (root) claim released → refcount 0 → drop

    expect(isQueued(loader, 'ship.png')).toBe(false);
  });
});
