import { Asset } from '#assets/Asset';
import { Assets } from '#assets/Assets';
import { coreAssetBindings } from '#assets/coreAssetBindings';
import { Loader } from '#assets/Loader';
import { materializeAssetBindings } from '#extensions/materialize';
import { BmFont } from '#rendering/text/BmFont';
import type { Texture } from '#rendering/texture/Texture';

function createCoreLoader(): Loader {
  const loader = new Loader({ basePath: '/' });
  materializeAssetBindings(loader, coreAssetBindings);

  return loader;
}

const originalFetch = global.fetch;

const FNT = `
common lineHeight=32 base=26
page id=0 file="page0.png"
chars count=0
`;

/** Counts requests per resolved URL, serving `.fnt` as text and everything else as bytes. */
function mockFetch(): Map<string, number> {
  const calls = new Map<string, number>();

  global.fetch = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);

    calls.set(url, (calls.get(url) ?? 0) + 1);

    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => FNT,
      json: async () => ({ ok: true }),
      arrayBuffer: async () => new ArrayBuffer(8),
    } as unknown as Response;
  }) as unknown as typeof fetch;

  return calls;
}

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

describe('multi-consumer ownership', () => {
  test('two scopes acquiring one asset share a single fetch and a single resident payload', async () => {
    const calls = mockFetch();
    const loader = createCoreLoader();
    const a = loader.scope('a');
    const b = loader.scope('b');

    const first = a.get('hero.png');
    const second = b.get('hero.png');

    await Promise.all([first.loaded, second.loaded]);

    expect(second).toBe(first);
    expect(calls.get('/hero.png')).toBe(1);
    expect(loader.inspect()).toHaveLength(1);
    expect(loader.inspect()[0]?.claims).toBe(2);
  });

  test('get() and load() racing on one source in the same tick fetch it once', async () => {
    const calls = mockFetch();
    const loader = createCoreLoader();
    const scope = loader.scope();

    const handle = scope.get('hero.png');
    const queued = scope.load(Asset.type('texture', 'hero.png'));

    await Promise.all([handle.loaded, queued]);

    expect(calls.get('/hero.png')).toBe(1);
    expect(loader.inspect()).toHaveLength(1);
  });

  test('one scope releasing leaves the other consumer fully valid', async () => {
    mockFetch();
    const loader = createCoreLoader();
    const a = loader.scope('a');
    const b = loader.scope('b');

    const handle = a.get('hero.png');
    b.get('hero.png');
    await handle.loaded;

    a.release(handle);

    expect(handle.loadState).toBe('ready');
    expect(handle.source).not.toBeNull();
    expect(loader.peek('hero.png')).not.toBeUndefined();
    expect(loader.inspect()[0]?.claims).toBe(1);
  });

  test('the last owner releasing frees the payload and re-arms the handle in place', async () => {
    mockFetch();
    const loader = createCoreLoader();
    const a = loader.scope('a');
    const b = loader.scope('b');

    const handle = a.get('hero.png');
    b.get('hero.png');
    await handle.loaded;

    a.release(handle);
    b.release(handle);

    expect(handle.loadState).toBe('loading');
    expect(handle.source).toBeNull();
    expect(loader.peek('hero.png')).toBeUndefined();
    expect(loader.inspect()).toHaveLength(0);
  });

  test('destroy() releases only that scope claims', async () => {
    mockFetch();
    const loader = createCoreLoader();
    const level = loader.scope('level');
    const hud = loader.scope('hud');

    const shared = level.get('shared.png');
    const private_ = level.get('private.png');
    hud.get('shared.png');

    await Promise.all([shared.loaded, private_.loaded]);
    expect(loader.inspect()).toHaveLength(2);

    level.destroy();

    expect(shared.loadState).toBe('ready'); // the HUD still owns it
    expect(private_.loadState).toBe('loading'); // nobody else did
    expect(loader.inspect()).toHaveLength(1);
  });

  test('a released scope can be released again without effect', async () => {
    mockFetch();
    const loader = createCoreLoader();
    const scope = loader.scope();
    const catalog = new Assets({ hero: { type: 'texture', source: 'hero.png' } });

    await scope.load(catalog);
    expect(loader.inspect()).toHaveLength(1);

    scope.destroy();
    expect(loader.inspect()).toHaveLength(0);

    expect(() => scope.destroy()).not.toThrow();
    expect(() => scope.release(catalog)).not.toThrow();
    expect(loader.inspect()).toHaveLength(0);
  });

  test('acquire and release cycles leave no claim behind', async () => {
    mockFetch();
    const loader = createCoreLoader();

    for (let i = 0; i < 3; i++) {
      const scope = loader.scope(`cycle-${i}`);
      const handle = scope.get('hero.png');

      await handle.loaded;
      scope.destroy();
    }

    expect(loader.inspect()).toHaveLength(0);
  });
});

describe('dependent asset ownership', () => {
  test('a sub-asset outlives the scope that happened to start the parent load', async () => {
    mockFetch();
    const loader = createCoreLoader();
    const first = loader.scope('first');
    const second = loader.scope('second');

    // `first` starts the font load; `second` joins the very same request.
    const [font] = await Promise.all([first.load(Asset.type('bmFont', 'fonts/ui.fnt')), second.load(Asset.type('bmFont', 'fonts/ui.fnt'))]);

    expect(font).toBeInstanceOf(BmFont);
    expect(font.textures[0]?.loadState).toBe('ready');

    // The page texture belongs to the font, not to whoever asked first.
    first.destroy();

    expect(font.textures[0]?.loadState).toBe('ready');
    expect(loader.peek(Asset.type('texture', 'fonts/page0.png'))).not.toBeUndefined();
  });

  test('a sub-asset is released once the asset that pulled it in loses its last owner', async () => {
    mockFetch();
    const loader = createCoreLoader();
    const scope = loader.scope('only');

    const font = await scope.load(Asset.type('bmFont', 'fonts/ui.fnt'));
    const page = font.textures[0]!;

    expect(page.loadState).toBe('ready');

    scope.destroy();

    expect(page.loadState).toBe('loading');
    expect(loader.peek(Asset.type('texture', 'fonts/page0.png'))).toBeUndefined();
    expect(loader.inspect()).toHaveLength(0);
  });

  test('a sub-asset an independent owner also holds survives its parent', async () => {
    mockFetch();
    const loader = createCoreLoader();
    const scope = loader.scope('font-owner');
    const pageOwner = loader.scope('page-owner');

    const font = await scope.load(Asset.type('bmFont', 'fonts/ui.fnt'));
    const page = pageOwner.get('fonts/page0.png') as Texture;

    expect(page).toBe(font.textures[0]);

    scope.destroy();

    expect(page.loadState).toBe('ready');
    expect(loader.peek('fonts/page0.png')).not.toBeUndefined();
  });
});
