import { materializeAssetBindings } from '#extensions/materialize';
import { Assets } from '#resources/Assets';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader, LoadPriority } from '#resources/Loader';

/** Loader with all core asset bindings (mirrors createCoreLoader in the sibling resource specs). */
function createCoreLoader(): Loader {
  const loader = new Loader();
  materializeAssetBindings(loader, coreAssetBindings);
  return loader;
}

const originalFetch = global.fetch;

const mockFetchImage = (): void => {
  global.fetch = vi.fn(
    async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', arrayBuffer: async () => new ArrayBuffer(8) }) as unknown as Response,
  );
};

/**
 * Options object whose getter throws while `_dispatchFetch` copies it into the
 * handler config. This is the one input that makes the dispatch fail
 * *synchronously*, before the returned promise exists — every real 404 or
 * decode error fails asynchronously instead.
 */
const hostileOptions = (): Record<string, unknown> =>
  ({
    get scaleMode(): never {
      throw new Error('hostile option getter');
    },
  }) as Record<string, unknown>;

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

    const handle = loader.get('ship.png', hostileOptions());

    await vi.waitFor(() => expect(handle.loadState).toBe('failed'));
  });

  test('dispatches onError for a seamless handle', async () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const onError = vi.fn();

    loader.onError.add(onError);
    loader.get('ship.png', hostileOptions());

    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
  });

  /**
   * The background queue cannot be reached with a hostile options object: the
   * `Assets` constructor materializes every leaf config up front, so a throwing
   * getter fires there rather than surviving into `QueueEntry.options`. The
   * dispatch is stubbed directly to cover the call site itself, whose failure
   * mode is worse than the seamless one — the throw escapes before `.finally()`
   * is attached, so the active counter never decrements and the queue wedges.
   */
  test('keeps the background queue draining instead of stalling awaitBackground()', async () => {
    mockFetchImage();
    const loader = createCoreLoader();
    const decoder = (loader as unknown as { _decoder: { _dispatchFetch: unknown } })._decoder;

    decoder._dispatchFetch = (): never => {
      throw new Error('synchronous dispatch failure');
    };

    const catalog = new Assets({ ship: { type: 'texture', source: 'ship.png' } });

    // load() rejects for a failed leaf even in background mode — settle it here
    // so the assertion below is about the queue draining, not about that.
    loader.load(catalog, { priority: LoadPriority.Background }).catch(() => {});

    await expect(loader.awaitBackground()).resolves.toBeUndefined();
  });
});
