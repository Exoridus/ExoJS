import { Assets } from '#assets/Assets';
import { coreAssetBindings } from '#assets/coreAssetBindings';
import { Loader } from '#assets/Loader';
import type { Application } from '#core/Application';
import { SceneLoader } from '#core/scene/SceneLoader';
import { materializeAssetBindings } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';

/** Loader with all core asset bindings (mirrors createCoreLoader in loader-seamless.test.ts). */
function createCoreLoader(): Loader {
  const loader = new Loader();
  materializeAssetBindings(loader, coreAssetBindings);
  return loader;
}

interface PendingFetch {
  readonly url: string;
  readonly signal: AbortSignal | undefined;
  settle(): void;
}

/**
 * Replaces `fetch` with one that never settles on its own: every call is
 * captured so a test can inspect the `AbortSignal` it was handed and settle it
 * explicitly. Rejects exactly like the platform does when its signal aborts.
 */
function mockPendingFetch(): PendingFetch[] {
  const calls: PendingFetch[] = [];

  global.fetch = vi.fn(
    async (input: unknown, init?: RequestInit): Promise<Response> =>
      new Promise<Response>((resolve, reject) => {
        const signal = init?.signal ?? undefined;
        const response = {
          ok: true,
          status: 200,
          statusText: 'OK',
          arrayBuffer: async () => new ArrayBuffer(8),
        } as unknown as Response;

        signal?.addEventListener('abort', () => {
          reject(signal.reason as Error);
        });

        calls.push({ url: String(input), signal, settle: () => resolve(response) });
      }),
  ) as unknown as typeof fetch;

  return calls;
}

/** Lets every pending microtask queued by the loader pipeline run. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

const originalFetch = global.fetch;

describe('asset load cancellation', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 16, height: 16 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  test('cancelling a load aborts the underlying fetch', async () => {
    const calls = mockPendingFetch();
    const loader = createCoreLoader();

    const queue = loader.load('ship.png');
    await flush();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(calls[0]?.signal?.aborted).toBe(false);

    queue.cancel();

    expect(calls[0]?.signal?.aborted).toBe(true);
    await expect(queue).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('a cancelled load does not dispatch onError', async () => {
    mockPendingFetch();
    const loader = createCoreLoader();
    const errors: Error[] = [];

    loader.onError.add((_type, _alias, error) => errors.push(error));

    const queue = loader.load('ship.png');
    await flush();

    queue.cancel();
    await expect(queue).rejects.toMatchObject({ name: 'AbortError' });
    await flush();

    expect(errors).toEqual([]);
  });

  test('a shared fetch survives one consumer cancelling and aborts only when the last leaves', async () => {
    const calls = mockPendingFetch();
    const loader = createCoreLoader();
    const app = { loader } as unknown as Application;

    const sceneA = new SceneLoader(app);
    const sceneB = new SceneLoader(app);

    const queueA = sceneA.load('shared.png');
    const queueB = sceneB.load('shared.png');
    await flush();

    // Both consumers deduped onto ONE in-flight fetch.
    expect(calls).toHaveLength(1);

    queueA.cancel();
    expect(calls[0]?.signal?.aborted).toBe(false);

    queueB.cancel();
    expect(calls[0]?.signal?.aborted).toBe(true);

    await expect(queueA).rejects.toMatchObject({ name: 'AbortError' });
    await expect(queueB).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('two claim scopes sharing one canonical fetch abort it only when both release', async () => {
    const calls = mockPendingFetch();
    const loader = createCoreLoader();
    const scopeA = loader.scope('scope-a');
    const scopeB = loader.scope('scope-b');
    const key = loader['_canonicalize'](Texture, 'same.png').key;

    const queueA = loader._loadClaimed(scopeA, 'same.png');
    const queueB = loader._loadClaimed(scopeB, 'same.png');
    await flush();

    // Two names, two owners, one canonical asset - and therefore one request.
    expect(calls).toHaveLength(1);

    loader._release(key, scopeA);
    expect(calls[0]?.signal?.aborted).toBe(false);

    loader._release(key, scopeB);
    expect(calls[0]?.signal?.aborted).toBe(true);

    await expect(queueA).rejects.toMatchObject({ name: 'AbortError' });
    await expect(queueB).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('SceneLoader.destroy() aborts its scope outstanding loads', async () => {
    const calls = mockPendingFetch();
    const loader = createCoreLoader();
    const app = { loader } as unknown as Application;
    const sceneLoader = new SceneLoader(app);

    const queue = sceneLoader.load('level.png');
    await flush();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.signal?.aborted).toBe(false);

    sceneLoader.destroy();

    expect(calls[0]?.signal?.aborted).toBe(true);
    await expect(queue).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('SceneLoader.destroy() leaves a fetch the app loader still claims running', async () => {
    const calls = mockPendingFetch();
    const loader = createCoreLoader();
    const app = { loader } as unknown as Application;
    const sceneLoader = new SceneLoader(app);

    const appQueue = loader.load('kept.png');
    const sceneQueue = sceneLoader.load('kept.png');
    await flush();

    expect(calls).toHaveLength(1);

    sceneLoader.destroy();
    expect(calls[0]?.signal?.aborted).toBe(false);

    calls[0]?.settle();

    await expect(appQueue).resolves.toBeInstanceOf(Texture);
    await expect(sceneQueue).resolves.toBeInstanceOf(Texture);
  });

  test('cancelling an adopted catalog load aborts every fetch it started', async () => {
    const calls = mockPendingFetch();
    const loader = createCoreLoader();

    const queue = loader.load(Assets.from({ hero: 'hero.png', tiles: 'tiles.png' }));
    await flush();

    expect(calls).toHaveLength(2);
    expect(calls.every(call => call.signal?.aborted === false)).toBe(true);

    queue.cancel();

    expect(calls.every(call => call.signal?.aborted === true)).toBe(true);
    await expect(queue).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('a load nobody cancels is unaffected: no abort, resolves normally', async () => {
    const calls = mockPendingFetch();
    const loader = createCoreLoader();

    const queue = loader.load('plain.png');
    await flush();

    calls[0]?.settle();

    await expect(queue).resolves.toBeInstanceOf(Texture);
    expect(calls[0]?.signal?.aborted).toBe(false);
  });
});
