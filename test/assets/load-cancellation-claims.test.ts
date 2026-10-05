import { Asset } from '#assets/Asset';
import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader } from '#assets/Loader';
import { materializeAssetTypes } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';

const createCoreLoader = (): Loader => {
  const loader = new Loader({ basePath: '/' });
  materializeAssetTypes(loader, coreAssetTypes);

  return loader;
};

interface PendingFetch {
  readonly url: string;
  readonly signal: AbortSignal | undefined;
  settle(): void;
}

const FNT = `
common lineHeight=32 base=26
page id=0 file="page0.png"
chars count=0
`;

/**
 * A `fetch` that never settles on its own: every call is captured so a test
 * decides when (and whether) it completes. Rejects like the platform does when
 * its signal aborts.
 */
const mockPendingFetch = (): PendingFetch[] => {
  const calls: PendingFetch[] = [];

  global.fetch = vi.fn(
    async (input: unknown, init?: RequestInit): Promise<Response> =>
      new Promise<Response>((resolve, reject) => {
        const signal = init?.signal ?? undefined;
        const response = {
          ok: true,
          status: 200,
          statusText: 'OK',
          text: async () => FNT,
          arrayBuffer: async () => new ArrayBuffer(8),
        } as unknown as Response;

        signal?.addEventListener('abort', () => {
          reject(signal.reason as Error);
        });

        calls.push({ url: String(input), signal, settle: () => resolve(response) });
      }),
  ) as unknown as typeof fetch;

  return calls;
};

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
};

const ignoreRejection = async (queue: PromiseLike<unknown>): Promise<void> => {
  await queue.then(
    () => undefined,
    () => undefined,
  );
};

const claimsOf = (loader: Loader, suffix: string): number => loader.inspect().find(row => row.locator.endsWith(suffix))?.claims ?? 0;

const originalFetch = global.fetch;

describe('load cancellation never revokes a claim another operation earned', () => {
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

  test('cancelling a redundant second load keeps the texture the first load made resident', async () => {
    const calls = mockPendingFetch();
    const loader = createCoreLoader();
    const scope = loader.createScope({ name: 'level' });

    const firstQueue = scope.load(Asset.type('texture', 'hero.png'));
    await flush();
    calls[0]?.settle();
    const first = await firstQueue;

    expect(first.width).toBe(16);
    expect(claimsOf(loader, 'hero.png')).toBe(1);

    const second = scope.load(Asset.type('texture', 'hero.png'));
    second.cancel();
    await ignoreRejection(second);

    expect(claimsOf(loader, 'hero.png')).toBe(1);
    expect(first.width).toBe(16);
    expect(first.destroyed).toBe(false);
    expect(calls).toHaveLength(1);
  });

  test('cancelling a redundant bare-path load keeps the first load resident', async () => {
    const calls = mockPendingFetch();
    const loader = createCoreLoader();
    const scope = loader.createScope({ name: 'level' });

    const firstQueue = scope.load('hero.png');
    await flush();
    calls[0]?.settle();
    const first = await firstQueue;

    const second = scope.load('hero.png');
    second.cancel();
    await ignoreRejection(second);

    expect(claimsOf(loader, 'hero.png')).toBe(1);
    expect(first).toBeInstanceOf(Texture);
    expect(first.width).toBe(16);
  });

  test('with two pending loads in one scope, cancelling one lets the other finish', async () => {
    const calls = mockPendingFetch();
    const loader = createCoreLoader();
    const scope = loader.createScope({ name: 'level' });

    const cancelled = scope.load(Asset.type('texture', 'hero.png'));
    const kept = scope.load(Asset.type('texture', 'hero.png'));
    await flush();

    expect(calls).toHaveLength(1);

    cancelled.cancel();
    expect(calls[0]?.signal?.aborted).toBe(false);

    calls[0]?.settle();

    const texture = await kept;

    expect(texture.width).toBe(16);
    expect(claimsOf(loader, 'hero.png')).toBe(1);
  });

  test('cancelling the only pending load of a scope still aborts the fetch and frees the claim', async () => {
    const calls = mockPendingFetch();
    const loader = createCoreLoader();
    const scope = loader.createScope({ name: 'level' });

    const queue = scope.load(Asset.type('texture', 'hero.png'));
    await flush();

    queue.cancel();

    expect(calls[0]?.signal?.aborted).toBe(true);
    await expect(queue).rejects.toMatchObject({ name: 'AbortError' });
    expect(loader.inspect()).toHaveLength(0);
  });

  test('cancelling every pending load of a scope aborts once the last participation leaves', async () => {
    const calls = mockPendingFetch();
    const loader = createCoreLoader();
    const scope = loader.createScope({ name: 'level' });

    const first = scope.load(Asset.type('texture', 'hero.png'));
    const second = scope.load(Asset.type('texture', 'hero.png'));
    await flush();

    first.cancel();
    expect(calls[0]?.signal?.aborted).toBe(false);

    second.cancel();
    expect(calls[0]?.signal?.aborted).toBe(true);

    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
    expect(loader.inspect()).toHaveLength(0);
  });

  test('a scope owning an asset is untouched when another scope cancels its pending load of it', async () => {
    const calls = mockPendingFetch();
    const loader = createCoreLoader();
    const owner = loader.createScope({ name: 'owner' });
    const other = loader.createScope({ name: 'other' });

    const ownerQueue = owner.load(Asset.type('texture', 'hero.png'));
    await flush();
    calls[0]?.settle();
    const texture = await ownerQueue;

    const otherQueue = other.load(Asset.type('texture', 'hero.png'));
    otherQueue.cancel();
    await ignoreRejection(otherQueue);

    expect(claimsOf(loader, 'hero.png')).toBe(1);
    expect(texture.width).toBe(16);
  });

  test('cancelling after the load settled leaves the scope ownership in place', async () => {
    const calls = mockPendingFetch();
    const loader = createCoreLoader();
    const scope = loader.createScope({ name: 'level' });

    const queue = scope.load(Asset.type('texture', 'hero.png'));
    await flush();
    calls[0]?.settle();
    const texture = await queue;

    queue.cancel();
    await flush();

    expect(queue.cancelled).toBe(true);
    expect(claimsOf(loader, 'hero.png')).toBe(1);
    expect(texture.width).toBe(16);

    scope.release(Asset.type('texture', 'hero.png'));

    expect(loader.inspect()).toHaveLength(0);
  });

  test('a cancel after the fetch but before decode completes disposes the late donor', async () => {
    const calls = mockPendingFetch();
    let finishDecode: (() => void) | undefined;

    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(
        async () =>
          new Promise(resolve => {
            finishDecode = () => resolve({ width: 16, height: 16, close: vi.fn() });
          }),
      ),
    );

    const loader = createCoreLoader();
    const scope = loader.createScope({ name: 'level' });
    const queue = scope.load(Asset.type('texture', 'hero.png'));
    await flush();

    calls[0]?.settle();
    await flush();
    expect(finishDecode).toBeDefined();

    queue.cancel();
    finishDecode?.();
    await ignoreRejection(queue);
    await flush();

    expect(loader.inspect()).toHaveLength(0);
  });

  test('explicitly releasing during a pending load is not undone when that load settles', async () => {
    const calls = mockPendingFetch();
    const loader = createCoreLoader();
    const scope = loader.createScope({ name: 'level' });
    const other = loader.createScope({ name: 'other' });

    const keeper = other.load(Asset.type('texture', 'hero.png'));
    const queue = scope.load(Asset.type('texture', 'hero.png'));
    await flush();

    scope.release(Asset.type('texture', 'hero.png'));
    calls[0]?.settle();
    await keeper;
    await ignoreRejection(queue);

    const owners = loader.inspect().find(row => row.locator.endsWith('hero.png'))?.owners ?? [];

    expect(owners.map(owner => owner.name)).toEqual(['other']);
  });

  test('two scopes sharing a dependency: cancelling one parent load keeps the other parent and its page', async () => {
    const calls = mockPendingFetch();
    const loader = createCoreLoader();
    const first = loader.createScope({ name: 'first' });
    const second = loader.createScope({ name: 'second' });

    const firstQueue = first.load(Asset.type('bmFont', 'fonts/ui.fnt'));
    const secondQueue = second.load(Asset.type('bmFont', 'fonts/ui.fnt'));
    await flush();

    // One shared font fetch; settle it so the page dependency is requested.
    calls[0]?.settle();
    await flush();

    const pageCall = calls.find(call => call.url.endsWith('page0.png'));

    expect(pageCall).toBeDefined();

    secondQueue.cancel();
    expect(pageCall?.signal?.aborted).toBe(false);

    pageCall?.settle();
    const font = await firstQueue;
    await ignoreRejection(secondQueue);

    expect(font.textures[0]?.width).toBe(16);
    expect(claimsOf(loader, 'fonts/ui.fnt')).toBe(1);
    expect(claimsOf(loader, 'fonts/page0.png')).toBe(1);
  });
});
