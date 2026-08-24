import { Assets } from '#assets/Assets';
import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader, LoadPriority } from '#assets/Loader';
import { materializeAssetTypes } from '#extensions/materialize';

/** Loader with every built-in asset type installed. */
function createCoreLoader(): Loader {
  const loader = new Loader();
  materializeAssetTypes(loader, coreAssetTypes);
  return loader;
}

const originalFetch = global.fetch;

const mockFetchImage = (): void => {
  global.fetch = vi.fn(
    async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', arrayBuffer: async () => new ArrayBuffer(8) }) as unknown as Response,
  );
};

/**
 * Makes the dispatch fail *synchronously*, before the promise the residency
 * attaches its bookkeeping to exists.
 *
 * Every real failure - a 404, a decode error, a factory that throws - reaches
 * the residency as a rejected promise instead, because the dispatch itself is
 * async. The synchronous case is what the residency's own guarding is for, and
 * it is only reachable by replacing the dispatch: without it a throw escapes
 * before `.finally()` is attached, the seamless handle stays stuck in
 * `'loading'`, and the background queue's active counter never decrements.
 */
function breakDispatch(loader: Loader): void {
  const decoder = (loader as unknown as { _decoder: { _dispatchFetch: unknown } })._decoder;

  decoder._dispatchFetch = (): never => {
    throw new Error('synchronous dispatch failure');
  };
}

describe('a synchronous throw out of the fetch dispatch', () => {
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

  test('fails the seamless handle instead of leaving it stuck in loading', async () => {
    mockFetchImage();
    const loader = createCoreLoader();

    breakDispatch(loader);

    const handle = loader.get('ship.png');

    await vi.waitFor(() => expect(handle.loadState).toBe('failed'));
  });

  test('dispatches onError for a seamless handle', async () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const onError = vi.fn();

    breakDispatch(loader);
    loader.onError.add(onError);
    loader.get('ship.png');

    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
  });

  test('keeps the background queue draining instead of stalling awaitBackground()', async () => {
    mockFetchImage();
    const loader = createCoreLoader();

    breakDispatch(loader);

    const catalog = new Assets({ ship: { type: 'texture', source: 'ship.png' } });

    // load() rejects for a failed leaf even in background mode - settle it here
    // so the assertion below is about the queue draining, not about that.
    loader.load(catalog, { priority: LoadPriority.Background }).catch(() => {});

    await expect(loader.awaitBackground()).resolves.toBeUndefined();
  });
});
