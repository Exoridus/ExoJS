/**
 * The demo catalog against the real Core loader: reading it does no IO, each
 * descriptor is claimed and loaded by exactly the loader it is handed to, and
 * the existing claim, cancellation, failure and catalog contracts are what a
 * caller of the catalog gets - none of them is changed for it.
 */
import { createDemoAssets, demoAssets } from '@codexo/exojs-demo-assets';

import { Asset } from '#assets/Asset';
import { AssetRef } from '#assets/AssetRef';
import { Assets } from '#assets/Assets';
import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader } from '#assets/Loader';
import type { Application } from '#core/Application';
import { SceneLoader } from '#core/scene/SceneLoader';
import { materializeAssetTypes } from '#extensions/materialize';
import { BmFont } from '#rendering/text/BmFont';
import { Texture } from '#rendering/texture/Texture';
import { Video } from '#rendering/video/Video';

const createCoreLoader = (): Loader => {
  const loader = new Loader();
  materializeAssetTypes(loader, coreAssetTypes);

  return loader;
};

const sceneOf = (loader: Loader): SceneLoader => new SceneLoader({ loader } as unknown as Application);

interface FetchCall {
  readonly url: string;
  readonly signal: AbortSignal | undefined;
  settle(): void;
}

interface FetchControl {
  readonly calls: FetchCall[];
  /** URLs answered with HTTP 500 instead of a body, consumed one failure at a time. */
  readonly failures: Map<string, number>;
  /** When set, responses wait for `settle()`. */
  hold: boolean;
}

const FNT_TEXT = [
  'info face="Kenney Blocks" size=32',
  'common lineHeight=32 base=27 scaleW=256 scaleH=256 pages=1 packed=0',
  'page id=0 file="../images/font-kenney-blocks-png.png"',
  'chars count=1',
  'char id=65 x=0 y=0 width=10 height=10 xoffset=0 yoffset=0 xadvance=10 page=0 chnl=15',
].join('\n');

const bodyFor = (url: string): { readonly text: string; readonly bytes: ArrayBuffer } => {
  if (url.endsWith('.fnt')) {
    return { text: FNT_TEXT, bytes: new TextEncoder().encode(FNT_TEXT).buffer };
  }

  if (url.endsWith('.json')) {
    return { text: '{"frames":{},"meta":{}}', bytes: new ArrayBuffer(2) };
  }

  // WebM magic: enough for the media type sniffing to accept the blob.
  return { text: '', bytes: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]).buffer };
};

const installFetch = (): FetchControl => {
  const control: FetchControl = { calls: [], failures: new Map(), hold: false };

  globalThis.fetch = vi.fn(
    async (input: unknown, init?: RequestInit): Promise<Response> =>
      new Promise<Response>((resolve, reject) => {
        const url = String(input);
        const signal = init?.signal ?? undefined;
        const remaining = control.failures.get(url) ?? 0;
        const failing = remaining > 0;

        if (failing) {
          control.failures.set(url, remaining - 1);
        }

        const { text, bytes } = bodyFor(url);
        const response = {
          ok: !failing,
          status: failing ? 500 : 200,
          statusText: failing ? 'Internal Server Error' : 'OK',
          url,
          headers: new Headers(),
          text: async () => text,
          json: async () => JSON.parse(text) as unknown,
          arrayBuffer: async () => bytes,
          blob: async () => new Blob([bytes]),
        } as unknown as Response;

        signal?.addEventListener('abort', () => reject(signal.reason as Error));

        const call = { url, signal, settle: () => resolve(response) };
        control.calls.push(call);

        if (!control.hold) {
          call.settle();
        }
      }),
  ) as unknown as typeof fetch;

  return control;
};

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
};

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 16, height: 16, close: () => undefined })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe('A01: importing and reading the catalog does no IO', () => {
  test('reading every property fetches, decodes and creates nothing', async () => {
    const fetchSpy = vi.fn();
    const bitmapSpy = vi.fn();
    const audioContextSpy = vi.fn();
    const fontFaceSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('createImageBitmap', bitmapSpy);
    vi.stubGlobal('AudioContext', audioContextSpy);
    vi.stubGlobal('FontFace', fontFaceSpy);
    const createElement = vi.spyOn(document, 'createElement');
    const imageSpy = vi.spyOn(globalThis, 'Image');

    vi.resetModules();
    const fresh = await import('@codexo/exojs-demo-assets');
    const extended = await import('@codexo/exojs-demo-assets/extended');

    const descriptors = Object.values(fresh.demoAssets);
    const seen = descriptors.map(descriptor => [descriptor.type, descriptor.source]);
    // Spread, serialization and enumeration are the reads a getter-based
    // catalog would turn into loads; here they must stay plain reads.
    void { ...fresh.demoAssets };
    void JSON.stringify(Object.keys(fresh.demoAssets));
    void extended.createExtendedDemoAssets('https://media.example.test/extended/').videoHdr10.source;
    void fresh.createDemoAssets('https://media.example.test/standard/').ship.source;

    expect(seen.length).toBeGreaterThan(100);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(bitmapSpy).not.toHaveBeenCalled();
    expect(audioContextSpy).not.toHaveBeenCalled();
    expect(fontFaceSpy).not.toHaveBeenCalled();
    expect(createElement).not.toHaveBeenCalled();
    expect(imageSpy).not.toHaveBeenCalled();
  });

  test('every value is a descriptor, never a placeholder resource', () => {
    for (const descriptor of Object.values(demoAssets)) {
      expect(descriptor).toBeInstanceOf(Asset);
      expect(descriptor).not.toBeInstanceOf(Texture);
      expect(descriptor).not.toBeInstanceOf(AssetRef);
    }
  });

  test('the shared catalog is frozen, so one application cannot rewrite what another reads', () => {
    expect(Object.isFrozen(demoAssets)).toBe(true);
  });
});

describe('A02: one get() requests one asset and only its own files', () => {
  test('SceneLoader.get(ship) fetches the ship and nothing else', async () => {
    const control = installFetch();
    const scene = sceneOf(createCoreLoader());

    const texture = scene.get(demoAssets.ship);
    await texture.loaded;

    expect(control.calls.map(call => call.url)).toEqual([demoAssets.ship.source]);
  });

  test('a bitmap font fetches its descriptor plus exactly the page it names', async () => {
    const control = installFetch();
    const scene = sceneOf(createCoreLoader());

    const font = await scene.load(demoAssets.fontKenneyBlocksFnt);

    expect(font).toBeInstanceOf(BmFont);
    expect(control.calls.map(call => call.url)).toEqual([demoAssets.fontKenneyBlocksFnt.source, demoAssets.fontKenneyBlocksPng.source]);
  });
});

describe('A03: await load() yields the finished resource and surfaces failures', () => {
  test('load(ship) resolves a ready Texture', async () => {
    installFetch();
    const scene = sceneOf(createCoreLoader());

    const texture = await scene.load(demoAssets.ship);

    expect(texture).toBeInstanceOf(Texture);
    expect(texture.state).toBe('ready');
  });

  test('a failed fetch rejects load() and fails the handle instead of reporting success', async () => {
    const control = installFetch();
    control.failures.set(demoAssets.ship.source, 1);
    const loader = createCoreLoader();
    const errors: Error[] = [];
    loader.onError.add((_type, _alias, error) => errors.push(error));
    const scene = sceneOf(loader);

    await expect(scene.load(demoAssets.ship)).rejects.toThrow();
    expect(errors).toHaveLength(1);
  });

  test('a JSON atlas keeps the AssetRef contract', async () => {
    installFetch();
    const scene = sceneOf(createCoreLoader());

    const ref = scene.get(demoAssets.platformerCharactersAtlas);

    expect(ref).toBeInstanceOf(AssetRef);
    await ref.loaded;
    expect(ref.value).toEqual({ frames: {}, meta: {} });
  });
});

describe('A04: leafless media load explicitly and offer no synchronous handle', () => {
  test.each([
    ['videoHighRes'],
    ['videoHighFps'],
    ['musicAtmosphericSynth'],
    ['fontKenneyFuture'],
    ['fontKenneyBlocksFnt'],
    ['iconPlay'],
  ] as const)('get(%s) is rejected at runtime with guidance to load() instead', key => {
    const loader = createCoreLoader();

    expect(() => loader.get(demoAssets[key] as never)).toThrow(/load/);
  });

  test('await load(videoHighRes) resolves a Video', async () => {
    installFetch();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);

      if (tagName === 'video') {
        queueMicrotask(() => element.dispatchEvent(new Event('canplay')));
      }

      return element;
    }) as typeof document.createElement);
    const scene = sceneOf(createCoreLoader());

    const video = await scene.load(demoAssets.videoHighRes);

    expect(video).toBeInstanceOf(Video);
    video.destroy();
  });

  test('await load(fontKenneyFuture) registers the font under its family', async () => {
    installFetch();
    const families: string[] = [];

    class FontFaceStub {
      public constructor(public readonly family: string) {
        families.push(family);
      }

      public load(): Promise<this> {
        return Promise.resolve(this);
      }
    }

    vi.stubGlobal('FontFace', FontFaceStub);
    Object.defineProperty(document, 'fonts', { configurable: true, value: { add: vi.fn(), delete: vi.fn() } });
    const scene = sceneOf(createCoreLoader());

    await scene.load(demoAssets.fontKenneyFuture);

    expect(families).toEqual(['Kenney Future']);
    Reflect.deleteProperty(document, 'fonts');
  });
});

describe('A05: two scenes on one loader share the payload, not the claim', () => {
  test('one fetch, and destroying one scene keeps the other scene resource intact', async () => {
    const control = installFetch();
    const loader = createCoreLoader();
    const sceneA = sceneOf(loader);
    const sceneB = sceneOf(loader);

    const fromA = await sceneA.load(demoAssets.ship);
    const fromB = await sceneB.load(demoAssets.ship);

    expect(control.calls).toHaveLength(1);
    expect(fromB).toBe(fromA);

    sceneA.destroy();

    expect(fromB.state).toBe('ready');
    expect(loader.inspect().some(row => row.aliases.includes(demoAssets.ship.source))).toBe(true);

    sceneB.destroy();

    expect(loader.inspect().some(row => row.aliases.includes(demoAssets.ship.source))).toBe(false);
  });
});

describe('A06: two applications reuse the definitions, never the resources', () => {
  test('each loader claims, fetches and owns its own texture', async () => {
    const control = installFetch();
    const first = sceneOf(createCoreLoader());
    const second = sceneOf(createCoreLoader());

    const a = first.get(demoAssets.ship);
    const b = second.get(demoAssets.ship);
    await Promise.all([a.loaded, b.loaded]);

    expect(a).not.toBe(b);
    expect(control.calls.map(call => call.url)).toEqual([demoAssets.ship.source, demoAssets.ship.source]);
  });

  test('a factory-made catalog is equally reusable across loaders', async () => {
    installFetch();
    const hosted = createDemoAssets('https://cdn.example.test/demo/');

    await expect(sceneOf(createCoreLoader()).load(hosted.ship)).resolves.toBeInstanceOf(Texture);
    await expect(sceneOf(createCoreLoader()).load(hosted.ship)).resolves.toBeInstanceOf(Texture);
  });
});

describe('A07: destroying a scope mid-fetch, failure and retry keep their contracts', () => {
  test('destroying the only claiming scene aborts its fetch', async () => {
    const control = installFetch();
    control.hold = true;
    const scene = sceneOf(createCoreLoader());

    const queue = scene.load(demoAssets.ship);
    await flush();
    scene.destroy();

    expect(control.calls[0]?.signal?.aborted).toBe(true);
    await expect(queue).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('a failed load is retried by the next load and then heals', async () => {
    const control = installFetch();
    control.failures.set(demoAssets.ship.source, 1);
    const scene = sceneOf(createCoreLoader());

    await expect(scene.load(demoAssets.ship)).rejects.toThrow();
    const texture = await scene.load(demoAssets.ship);

    expect(texture.state).toBe('ready');
    expect(control.calls).toHaveLength(2);
  });
});

describe('A08: a materialized Assets.from() catalog keeps its whole-catalog semantics', () => {
  test('get(catalog) claims and loads every leaf, not only the one read', async () => {
    const control = installFetch();
    const catalog = Assets.from({ ship: demoAssets.ship, flame: demoAssets.particleFlame });
    const loader = createCoreLoader();

    loader.get(catalog);
    await flush();

    expect(control.calls.map(call => call.url).sort()).toEqual([demoAssets.particleFlame.source, demoAssets.ship.source].sort());
  });

  test('its leaves stay bound to the first loader', () => {
    installFetch();
    const catalog = Assets.from({ ship: demoAssets.ship });

    createCoreLoader().get(catalog);

    expect(() => createCoreLoader().get(catalog)).toThrow(/already belongs to another loader/);
  });

  test('a leafless descriptor still cannot be held by a catalog', () => {
    expect(() => Assets.from({ video: demoAssets.videoHighRes as never })).toThrow(/no catalog leaf/);
  });
});
