import { BinaryFactory } from '#assets/factories/BinaryFactory';
import { SubtitleFactory } from '#assets/factories/SubtitleFactory';
import { XmlFactory } from '#assets/factories/XmlFactory';
import type { AssetLoaderContext, Loader } from '#assets/Loader';
import type { LoaderScope } from '#assets/LoaderScope';
import type { AssetBinding, AssetHandler } from '#extensions/Extension';
import { BmFont } from '#rendering/text/BmFont';
import { type Texture } from '#rendering/texture/Texture';

// ---------------------------------------------------------------------------
// VTTCue polyfill - jsdom does not implement the TextTrack cue API (see
// subtitle-factory.test.ts, the canonical source of this pattern).
// ---------------------------------------------------------------------------

class MockVTTCue {
  public vertical: '' | 'rl' | 'lr' = '';
  public line: number | 'auto' = 'auto';
  public lineAlign: 'start' | 'center' | 'end' = 'start';
  public position: number | 'auto' = 'auto';
  public positionAlign: 'auto' | 'line-left' | 'center' | 'line-right' = 'auto';
  public size = 100;
  public align: 'start' | 'center' | 'end' | 'left' | 'right' = 'center';

  public constructor(
    public startTime: number,
    public endTime: number,
    public text: string,
  ) {}
}

const originalVTTCue = (globalThis as { VTTCue?: unknown }).VTTCue;

beforeAll(() => {
  (globalThis as { VTTCue?: unknown }).VTTCue = MockVTTCue;
});

afterAll(() => {
  (globalThis as { VTTCue?: unknown }).VTTCue = originalVTTCue;
});

// ---------------------------------------------------------------------------
// Test helpers - call the handlers returned by coreAssetBindings directly,
// bypassing the full Loader/fetch machinery (a plain module, per the task
// brief: no DI harness needed).
// ---------------------------------------------------------------------------

function findBinding(bindings: readonly AssetBinding[], typeName: string): AssetBinding {
  const binding = bindings.find(b => b.typeNames?.includes(typeName));

  if (!binding) throw new Error(`No core binding declares typeName "${typeName}".`);

  return binding;
}

function makeContext(overrides: Partial<AssetLoaderContext> = {}): AssetLoaderContext {
  return {
    loader: {} as Loader,
    scope: { load: vi.fn(async () => ({})) } as unknown as LoaderScope,
    identityKey: 'test:key',
    fetchText: vi.fn(async () => ''),
    fetchArrayBuffer: vi.fn(async () => new ArrayBuffer(0)),
    fetchJson: vi.fn(async () => ({})),
    ...overrides,
  };
}

const fakeLoader = {} as Loader;

describe('coreAssetBindings — binaryFactoryHandler (generic binary-backed handler body)', () => {
  test('load() fetches an ArrayBuffer via the context and forwards it to the factory', async () => {
    const { coreAssetBindings } = await import('#assets/coreAssetBindings');
    const binding = findBinding(coreAssetBindings, 'binary');
    const handler = binding.create(fakeLoader) as AssetHandler<ArrayBuffer>;
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const context = makeContext({ fetchArrayBuffer: vi.fn(async () => bytes) });

    const result = await handler.load({ source: 'x.bin' }, context);

    expect(context.fetchArrayBuffer).toHaveBeenCalledWith('x.bin');
    // BinaryFactory.create() is a pure pass-through of the fetched bytes.
    expect(result).toBe(bytes);
  });

  test('destroy() delegates to the underlying factory', async () => {
    const { coreAssetBindings } = await import('#assets/coreAssetBindings');
    const binding = findBinding(coreAssetBindings, 'binary');
    const handler = binding.create(fakeLoader) as AssetHandler<ArrayBuffer>;
    const destroySpy = vi.spyOn(BinaryFactory.prototype, 'destroy');

    handler.destroy?.();

    expect(destroySpy).toHaveBeenCalledTimes(1);
    destroySpy.mockRestore();
  });
});

describe('coreAssetBindings — textFactoryHandler (generic text-backed handler body)', () => {
  test('load() fetches text via the context and forwards it to the factory', async () => {
    const { coreAssetBindings } = await import('#assets/coreAssetBindings');
    const binding = findBinding(coreAssetBindings, 'xml');
    const handler = binding.create(fakeLoader) as AssetHandler<Document>;
    const context = makeContext({ fetchText: vi.fn(async () => '<root/>') });

    const doc = await handler.load({ source: 'x.xml' }, context);

    expect(context.fetchText).toHaveBeenCalledWith('x.xml');
    expect(doc).toBeInstanceOf(Document);
  });

  test('createFromBytes() decodes UTF-8 bytes and forwards the text to the factory', async () => {
    const { coreAssetBindings } = await import('#assets/coreAssetBindings');
    const binding = findBinding(coreAssetBindings, 'xml');
    const handler = binding.create(fakeLoader) as AssetHandler<Document>;
    const bytes = new TextEncoder().encode('<root/>').buffer;

    const doc = await handler.createFromBytes?.(bytes);

    expect(doc).toBeInstanceOf(Document);
  });

  test('destroy() delegates to the underlying factory', async () => {
    const { coreAssetBindings } = await import('#assets/coreAssetBindings');
    const binding = findBinding(coreAssetBindings, 'xml');
    const handler = binding.create(fakeLoader) as AssetHandler<Document>;
    const destroySpy = vi.spyOn(XmlFactory.prototype, 'destroy');

    handler.destroy?.();

    expect(destroySpy).toHaveBeenCalledTimes(1);
    destroySpy.mockRestore();
  });
});

describe('coreAssetBindings — textBinding (dedicated, non-factory handler)', () => {
  test('load() fetches text via the context', async () => {
    const { coreAssetBindings } = await import('#assets/coreAssetBindings');
    const binding = findBinding(coreAssetBindings, 'text');
    const handler = binding.create(fakeLoader) as AssetHandler<string>;
    const context = makeContext({ fetchText: vi.fn(async () => 'hello world') });

    await expect(handler.load({ source: 'x.txt' }, context)).resolves.toBe('hello world');
    expect(context.fetchText).toHaveBeenCalledWith('x.txt');
  });
});

describe('coreAssetBindings — subtitleBinding', () => {
  test('load() detects the "vtt" format and parses cues from the fetched text', async () => {
    const { coreAssetBindings } = await import('#assets/coreAssetBindings');
    const binding = findBinding(coreAssetBindings, 'vtt');
    const handler = binding.create(fakeLoader) as AssetHandler<VTTCue[]>;
    const vttText = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello';
    const context = makeContext({ fetchText: vi.fn(async () => vttText) });

    const cues = await handler.load({ source: 'captions.vtt' }, context);

    expect(cues).toHaveLength(1);
  });

  test('load() strips a query string before detecting a ".srt" extension', async () => {
    const { coreAssetBindings } = await import('#assets/coreAssetBindings');
    const binding = findBinding(coreAssetBindings, 'srt');
    const handler = binding.create(fakeLoader) as AssetHandler<VTTCue[]>;
    const srtText = '1\n00:00:01,000 --> 00:00:02,000\nHello';
    const context = makeContext({ fetchText: vi.fn(async () => srtText) });

    const cues = await handler.load({ source: 'captions.srt?v=2' }, context);

    expect(cues).toHaveLength(1);
  });

  test('destroy() delegates to the underlying SubtitleFactory', async () => {
    const { coreAssetBindings } = await import('#assets/coreAssetBindings');
    const binding = findBinding(coreAssetBindings, 'vtt');
    const handler = binding.create(fakeLoader) as AssetHandler<VTTCue[]>;
    const destroySpy = vi.spyOn(SubtitleFactory.prototype, 'destroy');

    handler.destroy?.();

    expect(destroySpy).toHaveBeenCalledTimes(1);
    destroySpy.mockRestore();
  });
});

describe('coreAssetBindings — bmFontBinding', () => {
  test('load() parses the descriptor and loads each page texture through the dependency scope, resolved relative to the source', async () => {
    const { coreAssetBindings } = await import('#assets/coreAssetBindings');
    const binding = findBinding(coreAssetBindings, 'bmFont');
    const fakeTexture = {} as Texture;
    const handler = binding.create({} as Loader) as AssetHandler<BmFont>;
    const scopeLoad = vi.fn(async () => fakeTexture);

    const fnt = `
common lineHeight=32 base=26
page id=0 file="page0.png"
chars count=0
`;
    const context = makeContext({ fetchText: vi.fn(async () => fnt), scope: { load: scopeLoad } as unknown as LoaderScope });

    const font = await handler.load({ source: 'fonts/ui.fnt' }, context);

    expect(font).toBeInstanceOf(BmFont);
    expect(font.textures).toEqual([fakeTexture]);
    // Page textures are owned by the font's own dependency scope, never by the
    // application-lifetime loader.
    expect(scopeLoad).toHaveBeenCalledWith(expect.objectContaining({ _config: expect.objectContaining({ type: 'texture', source: 'fonts/page0.png' }) }));
  });
});

// ---------------------------------------------------------------------------
// Environment-gated conditional bindings - the module reads `typeof FontFace`,
// `typeof HTMLImageElement`, and `typeof WebAssembly` once at module-eval
// time. Force a fresh evaluation under a mutated global to exercise both
// sides of each gate.
// ---------------------------------------------------------------------------

describe('coreAssetBindings — conditional bindings (environment gating)', () => {
  test('the FontAsset binding is registered when FontFace is defined', async () => {
    const original = (globalThis as { FontFace?: unknown }).FontFace;
    (globalThis as { FontFace?: unknown }).FontFace = class {};
    vi.resetModules();

    try {
      const { coreAssetBindings } = await import('#assets/coreAssetBindings');
      const binding = findBinding(coreAssetBindings, 'font');

      expect(binding).toBeDefined();

      // Also exercise the binding's factory-maker closure itself (only invoked
      // once something actually calls create() on the registered binding).
      expect(() => binding.create(fakeLoader)).not.toThrow();
    } finally {
      if (original === undefined) delete (globalThis as { FontFace?: unknown }).FontFace;
      else (globalThis as { FontFace?: unknown }).FontFace = original;
      vi.resetModules();
    }
  });

  test('the ImageAsset binding is omitted when HTMLImageElement is undefined', async () => {
    const original = globalThis.HTMLImageElement;
    // @ts-expect-error - deliberately removing a normally-always-present global to test the gate.
    delete globalThis.HTMLImageElement;
    vi.resetModules();

    try {
      const { coreAssetBindings } = await import('#assets/coreAssetBindings');
      expect(coreAssetBindings.some(b => b.typeNames?.includes('image'))).toBe(false);
    } finally {
      globalThis.HTMLImageElement = original;
      vi.resetModules();
    }
  });

  test('the WasmAsset binding is omitted when WebAssembly is undefined', async () => {
    const original = globalThis.WebAssembly;
    // @ts-expect-error - deliberately removing a normally-always-present global to test the gate.
    delete globalThis.WebAssembly;
    vi.resetModules();

    try {
      const { coreAssetBindings } = await import('#assets/coreAssetBindings');
      expect(coreAssetBindings.some(b => b.typeNames?.includes('wasm'))).toBe(false);
    } finally {
      globalThis.WebAssembly = original;
      vi.resetModules();
    }
  });
});
