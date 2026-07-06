import { materializeAssetBindings } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader } from '#resources/Loader';

function createCoreLoader(): Loader {
  const loader = new Loader();
  materializeAssetBindings(loader, coreAssetBindings);
  return loader;
}

const originalFetch = global.fetch;

describe('backgroundLoad(Type, srcs)', () => {
  beforeEach(() => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 16, height: 16 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  const mockFetchImage = (): ReturnType<typeof vi.fn> => {
    const fetchMock = vi.fn(
      async (): Promise<Response> =>
        ({ ok: true, status: 200, statusText: 'OK', arrayBuffer: async () => new ArrayBuffer(8) }) as unknown as Response,
    );

    global.fetch = fetchMock as typeof fetch;

    return fetchMock;
  };

  test('declares and queues sources in one step; loadAll drains them', async () => {
    const fetchMock = mockFetchImage();
    const loader = createCoreLoader();

    loader.backgroundLoad(Texture, ['a.png', 'b.png']);
    await loader.loadAll();

    expect(loader.has(Texture, 'a.png')).toBe(true);
    expect(loader.has(Texture, 'b.png')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('single-source form and re-declared sources are deduped', async () => {
    const fetchMock = mockFetchImage();
    const loader = createCoreLoader();

    loader.backgroundLoad(Texture, 'a.png');
    loader.backgroundLoad(Texture, 'a.png');
    await loader.loadAll();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('get() on a background-queued source boosts it and converges on one instance', async () => {
    const fetchMock = mockFetchImage();
    const loader = createCoreLoader();

    loader.setConcurrency(0); // keep the queue parked so boost is observable
    loader.backgroundLoad(Texture, ['a.png', 'b.png']);

    const handle = loader.get(Texture, 'b.png'); // boosts b past the parked queue

    await expect(handle.loaded).resolves.toBe(handle);
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the boosted source fetched so far
    expect(loader.get(Texture, 'b.png')).toBe(handle);
  });

  test('onProgress reports across the declared batch', async () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const ticks: Array<[number, number]> = [];

    loader.onProgress.add((loaded, total) => ticks.push([loaded, total]));
    loader.backgroundLoad(Texture, ['a.png', 'b.png']);
    await loader.loadAll();

    expect(ticks.at(-1)).toEqual([2, 2]);
  });
});
