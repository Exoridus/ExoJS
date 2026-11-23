import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader, LoadPriority } from '#assets/Loader';
import { Sound } from '#audio/Sound';
import type { Application } from '#core/Application';
import { SceneLoader } from '#core/scene/SceneLoader';
import { materializeAssetTypes } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';
import { Video } from '#rendering/video/Video';

const { decodeAudioDataMock } = vi.hoisted(() => ({
  decodeAudioDataMock: vi.fn(async (): Promise<AudioBuffer> => ({ duration: 2 }) as AudioBuffer),
}));

vi.mock('#audio/audioContext', () => ({
  decodeAudioData: decodeAudioDataMock,
}));

const originalFetch = global.fetch;
const bodies: Record<string, string> = {
  '/config.json': '{"start":"intro"}',
  '/notes.notes': ' hello ',
  '/data.level': 'LEVEL',
};

const mockFetch = (): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const body = bodies[url] ?? 'xxxxxxxx';

    if (init?.signal?.aborted === true) {
      throw init.signal.reason as Error;
    }

    if (url.endsWith('missing.level')) {
      return { ok: false, status: 404, statusText: 'Not Found' } as unknown as Response;
    }

    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => body,
      arrayBuffer: async () => new TextEncoder().encode(body).buffer,
      blob: async () => new Blob([body]),
    } as unknown as Response;
  });

  global.fetch = fetchMock as unknown as typeof fetch;

  return fetchMock;
};

class Level {
  public constructor(public readonly size: number) {}
}

class Notes {
  public constructor(public readonly text: string) {}
}

const createLoader = (): Loader => {
  const loader = new Loader({ basePath: '/' });
  materializeAssetTypes(loader, coreAssetTypes);

  return loader;
};

const claimsOf = (loader: Loader, suffix: string): number => loader.inspect().find(row => row.locator.endsWith(suffix))?.claims ?? 0;

describe('unified asset loading', () => {
  beforeEach(() => {
    mockFetch();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 16, height: 16, close: () => {} })),
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllGlobals();
    decodeAudioDataMock.mockClear();
  });

  test('a named group of paths resolves to the same shape with loaded values', async () => {
    const loader = createLoader();
    const { hero, config, click } = await loader._assetTypes.load({ hero: 'hero.png', config: 'config.json', click: 'click.wav' });

    expect(hero).toBeInstanceOf(Texture);
    expect(hero.width).toBe(16);
    expect(config).toEqual({ start: 'intro' });
    expect(click).toBeInstanceOf(Sound);
  });

  test('arrays mix paths, handles and descriptors and keep their order', async () => {
    const loader = createLoader();
    const handle = new Texture('b.png');
    const result = await loader.load([
      'a.png',
      handle,
      { type: 'json', source: 'config.json', parse: (raw: unknown) => raw as { start: string } },
      { type: Texture, source: 'c.png' },
    ]);

    expect(result).toHaveLength(4);
    expect(result[0]).toBeInstanceOf(Texture);
    expect(result[1]).toBe(handle);
    expect(handle.width).toBe(16);
    expect(result[2]).toEqual({ start: 'intro' });
    expect(result[3]).toBeInstanceOf(Texture);
  });

  test('a single path resolves to the same resident resource as a group entry', async () => {
    const loader = createLoader();
    const single = await loader.load('hero.png');
    const { hero } = await loader.load({ hero: 'hero.png' });

    expect(hero).toBe(single);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('a class-typed descriptor carries per-asset options into identity', async () => {
    const loader = createLoader();
    const [srgb, data] = await loader.load([
      { type: Texture, source: 'height.png' },
      { type: Texture, source: 'height.png', textureOptions: { colorSpace: 'none' } },
    ]);

    expect(srgb).not.toBe(data);
    expect(data.colorSpace).toBe('none');
  });

  test('invalid entries throw before any claim opens', () => {
    const loader = createLoader();
    const scope = loader.createScope();

    expect(() => scope.load({ hero: 'hero.png', bad: 42 } as never)).toThrow(/must be a path/);
    expect(() => scope.load(['hero.png', 'intro.mp4'] as never)).toThrow(/no installed asset type claims/);
    expect(() => scope.load([class Unknown {}, 'x.dat'] as never)).toThrow();
    expect(claimsOf(loader, 'hero.png')).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('per-asset options are rejected as load options', () => {
    const loader = createLoader();

    expect(() => loader.load('hero.png', { textureOptions: {} } as never)).toThrow(/only takes LoadOptions/);
  });

  test('background priority turns paths into placeholders and rejects types without one', async () => {
    const loader = createLoader();
    const scope = loader.createScope();
    const queue = scope.load({ hero: 'hero.png' }, { priority: LoadPriority.Background });

    await loader.awaitBackground();
    const { hero } = await queue;

    expect(hero).toBeInstanceOf(Texture);
    expect(hero.width).toBe(16);
    expect(() => scope.load({ type: Video, source: 'intro.mp4' }, { priority: LoadPriority.Background })).toThrow(/no placeholder/);
  });

  test('cancelling a group withdraws its pending stakes and rejects with AbortError', async () => {
    const loader = createLoader();
    const scope = loader.createScope();
    const queue = scope.load({ hero: 'hero.png', config: 'config.json' });

    queue.cancel();

    await expect(queue).rejects.toMatchObject({ name: 'AbortError' });
    expect(claimsOf(loader, 'hero.png')).toBe(0);
  });

  test('progress counts every entry of a group', async () => {
    const loader = createLoader();
    const queue = loader.load(['a.png', 'b.png', 'config.json']);
    const seen: number[] = [];

    queue.onProgress.add(progress => seen.push(progress.loaded));
    await queue;

    expect(queue.progress).toMatchObject({ total: 3, loaded: 3, pending: 0, failed: 0 });
    expect(seen).toEqual([1, 2, 3]);
  });
});

describe('asset owners', () => {
  beforeEach(() => {
    mockFetch();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 16, height: 16, close: () => {} })),
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllGlobals();
  });

  test('scene assets are released with the scene while an application claim keeps them resident', async () => {
    const loader = createLoader();
    const app = { loader } as unknown as Application;
    const scene = new SceneLoader(app);

    const fromScene = await scene.load('hero.png');
    const fromApp = await loader._assetTypes.load('hero.png');

    expect(fromApp).toBe(fromScene);
    expect(claimsOf(loader, 'hero.png')).toBe(2);

    scene.destroy();

    expect(claimsOf(loader, 'hero.png')).toBe(1);
    expect(fromApp.width).toBe(16);
  });

  test('release accepts the same paths and groups load accepts', async () => {
    const loader = createLoader();
    const scope = loader.createScope();

    await scope.load({ hero: 'hero.png', data: { type: Texture, source: 'data.png' }, config: 'config.json' });
    expect(claimsOf(loader, 'hero.png')).toBe(1);

    scope.release({ hero: 'hero.png', data: { type: Texture, source: 'data.png' } });
    scope.release('config.json');

    expect(claimsOf(loader, 'hero.png')).toBe(0);
    expect(claimsOf(loader, 'data.png')).toBe(0);
    expect(claimsOf(loader, 'config.json')).toBe(0);
  });

  test('release preserves the symbol-key contract of load for named records', async () => {
    const loader = createLoader();
    const scope = loader.createScope();
    const symbol = Symbol('hero');
    const group = { [symbol]: 'hero.png' } as const;

    await scope.load(group);
    expect(claimsOf(loader, 'hero.png')).toBe(1);

    scope.release(group);
    expect(claimsOf(loader, 'hero.png')).toBe(0);
    scope.destroy();
    loader.destroy();
  });

  test('a plain object with an own type is always a descriptor, never a group with a "type" key', async () => {
    const loader = createLoader();
    const scope = loader.createScope();
    const ambiguous = { type: 'hero.png', data: { type: Texture, source: 'data.png' } } as never;

    await expect(scope.load(ambiguous)).rejects.toThrow(/no asset type "hero\.png" is installed.*cannot use "type" as a key/);
    expect(claimsOf(loader, 'hero.png')).toBe(0);
    expect(claimsOf(loader, 'data.png')).toBe(0);

    const renamed = { hero: 'hero.png', data: { type: Texture, source: 'data.png' } } as const;

    await scope.load(renamed);
    expect(claimsOf(loader, 'hero.png')).toBe(1);
    expect(claimsOf(loader, 'data.png')).toBe(1);
    scope.release(renamed);
    expect(claimsOf(loader, 'hero.png')).toBe(0);
    expect(claimsOf(loader, 'data.png')).toBe(0);
    scope.destroy();
    loader.destroy();
  });

  test('direct object request passes a structured source and extra properties to a custom decoder without fetching', async () => {
    class Generated {
      public constructor(public readonly value: number) {}
    }

    const loader = createLoader();
    const decode = vi.fn((source: ArrayBuffer, context: { options?: unknown }) => {
      const input = source as unknown as { value: number };
      const options = context.options as { scale: number };

      return new Generated(input.value * options.scale);
    });

    loader._assetTypes.define(Generated, { type: 'generated', decode });
    const scope = loader.createScope();
    const request = { type: Generated, source: { value: 7 }, scale: 3 };
    const first = await scope.load(request);
    const second = await scope.load(request);

    expect(first).toBeInstanceOf(Generated);
    expect(first.value).toBe(21);
    expect(second).toBe(first);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
    scope.release(request);
    scope.destroy();
    loader.destroy();
  });

  test('a source-free request reaches a registered custom factory as undefined', async () => {
    class Noise {
      public constructor(public readonly seed: number) {}
    }

    const loader = createLoader();
    const decode = vi.fn((_source: ArrayBuffer, context: { options?: unknown }) => new Noise((context.options as { seed: number }).seed));

    loader._assetTypes.define(Noise, { type: 'noise', decode });
    const scope = loader.createScope();
    const noise = await scope.load({ type: Noise, seed: 42 });

    expect(noise).toBeInstanceOf(Noise);
    expect(noise.seed).toBe(42);
    expect(decode.mock.calls[0]?.[0]).toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
    scope.destroy();
    loader.destroy();
  });

  test('two applications load the same path independently', async () => {
    const first = createLoader();
    const second = createLoader();

    const [a, b] = await Promise.all([first._assetTypes.load('hero.png'), second._assetTypes.load('hero.png')]);

    expect(a).not.toBe(b);
    first.destroy();
    expect(b.width).toBe(16);
  });
});

describe('define() with decode', () => {
  beforeEach(() => {
    mockFetch();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('a synchronous decode receives bytes and its type loads by suffix and by class-typed descriptor', async () => {
    const loader = createLoader();

    loader._assetTypes.define(Level, { type: 'level', extensions: ['level'], decode: bytes => new Level(bytes.byteLength) });

    const level = await loader.load('data.level' as string);
    const typed = await loader.load({ type: Level, source: 'data.level' });

    expect(level).toBeInstanceOf(Level);
    expect((level as Level).size).toBe(5);
    expect(typed).toBe(level);
  });

  test('read selects text, json or blob before an asynchronous decode', async () => {
    const loader = createLoader();

    loader._assetTypes.define(Notes, { type: 'notes', read: 'text', decode: async text => new Notes(text.trim()) });
    loader._assetTypes.define(Level, { type: 'level', read: 'blob', decode: async blob => new Level(blob.size) });

    const [notes, level] = await loader.load([
      { type: Notes, source: 'notes.notes' },
      { type: Level, source: 'data.level' },
    ]);

    expect(notes.text).toBe('hello');
    expect(level.size).toBe(5);
  });

  test('a throwing decode rejects the load and a later load retries', async () => {
    const loader = createLoader();
    let fail = true;

    loader._assetTypes.define(Level, {
      type: 'level',
      decode: bytes => {
        if (fail) {
          throw new Error('corrupt level');
        }

        return new Level(bytes.byteLength);
      },
    });

    await expect(loader.load({ type: Level, source: 'data.level' })).rejects.toThrow(/corrupt level/);

    fail = false;

    await expect(loader.load({ type: Level, source: 'data.level' })).resolves.toBeInstanceOf(Level);
  });

  test('a fetch failure rejects without calling decode', async () => {
    const loader = createLoader();
    const decode = vi.fn(() => new Level(0));

    loader._assetTypes.define(Level, { type: 'level', decode });

    await expect(loader.load({ type: Level, source: 'missing.level' })).rejects.toThrow();
    expect(decode).not.toHaveBeenCalled();
  });

  test('decode sees the load signal abort once its only owner cancels', async () => {
    const loader = createLoader();
    let seen: AbortSignal | undefined;
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });

    loader._assetTypes.define(Level, {
      type: 'level',
      decode: async (bytes, { signal }) => {
        seen = signal;
        await gate;

        return new Level(bytes.byteLength);
      },
    });

    const queue = loader.createScope().load({ type: Level, source: 'data.level' });

    await vi.waitFor(() => expect(seen).toBeDefined());
    queue.cancel();
    release();

    await expect(queue).rejects.toMatchObject({ name: 'AbortError' });
    expect(seen?.aborted).toBe(true);
  });

  test('dispose runs when the last owner releases a decoded resource', async () => {
    const loader = createLoader();
    const dispose = vi.fn();

    loader._assetTypes.define(Level, { type: 'level', decode: bytes => new Level(bytes.byteLength), dispose });

    const scope = loader.createScope();
    const level = await scope.load({ type: Level, source: 'data.level' });

    scope.destroy();

    expect(dispose).toHaveBeenCalledWith(level);
  });

  test('a definition needs exactly one of decode and loader', () => {
    const loader = createLoader();

    expect(() => loader._assetTypes.define(Level, { type: 'level' } as never)).toThrow(/either a decode function or a loader/);
    expect(() =>
      loader._assetTypes.define(Level, {
        type: 'level',
        decode: () => new Level(1),
        loader: { create: async () => new Level(1) },
      } as never),
    ).toThrow(/either a decode function or a loader/);
    expect(() => loader._assetTypes.define(Level, { type: 'level', read: 'stream', decode: () => new Level(1) } as never)).toThrow(
      /unknown read kind/,
    );
  });
});
