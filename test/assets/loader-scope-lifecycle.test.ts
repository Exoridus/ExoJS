import { Asset } from '#assets/Asset';
import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader } from '#assets/Loader';
import type { Application } from '#core/Application';
import { SceneLoader } from '#core/scene/SceneLoader';
import { materializeAssetTypes } from '#extensions/materialize';

const createCoreLoader = (): Loader => {
  const loader = new Loader({ basePath: '/' });
  materializeAssetTypes(loader, coreAssetTypes);

  return loader;
};

const originalFetch = global.fetch;

const FNT = `
common lineHeight=32 base=26
page id=0 file="page0.png"
chars count=0
`;

/** Counts requests per resolved URL, serving `.fnt` as text and everything else as bytes. */
const mockFetch = (): Map<string, number> => {
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
};

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

describe('createScope', () => {
  test('every call creates a new owner rather than looking one up', () => {
    const loader = createCoreLoader();

    const a = loader.createScope({ name: 'world' });
    const b = loader.createScope({ name: 'world' });

    expect(a).not.toBe(b);
    expect(a.id).not.toBe(b.id);
    expect(a.name).toBe('world');
    expect(b.name).toBe('world');
  });

  test('two scopes sharing a name claim one canonical asset independently', async () => {
    const calls = mockFetch();
    const loader = createCoreLoader();

    const a = loader.createScope({ name: 'world' });
    const b = loader.createScope({ name: 'world' });

    const handle = a.get('hero.png');
    b.get('hero.png');

    await handle.loaded;

    expect(calls.get('/hero.png')).toBe(1);
    expect(loader.inspect()).toHaveLength(1);
    expect(loader.inspect()[0]?.claims).toBe(2);

    a.destroy();

    expect(loader.inspect()[0]?.claims).toBe(1);
    expect(handle.loadState).toBe('ready');

    b.destroy();

    expect(loader.inspect()).toHaveLength(0);
    expect(handle.loadState).toBe('loading');
  });

  test('the name never reaches asset identity', async () => {
    const calls = mockFetch();
    const loader = createCoreLoader();

    const named = loader.createScope({ name: 'world' });
    const anonymous = loader.createScope();

    await Promise.all([named.get('hero.png').loaded, anonymous.get('hero.png').loaded]);

    expect(calls.get('/hero.png')).toBe(1);
    expect(loader.inspect()).toHaveLength(1);
    expect(loader.inspect()[0]?.owners.map(owner => owner.name)).toEqual(['world', undefined]);
  });
});

describe('child scopes', () => {
  test('a child is an independent claim owner', async () => {
    mockFetch();
    const loader = createCoreLoader();
    const parent = loader.createScope({ name: 'world' });
    const child = parent.createScope({ name: 'chunk' });

    const handle = parent.get('hero.png');
    child.get('hero.png');

    await handle.loaded;

    expect(loader.inspect()[0]?.claims).toBe(2);

    child.destroy();

    expect(loader.inspect()[0]?.claims).toBe(1);
    expect(handle.loadState).toBe('ready');
  });

  test('destroying a child leaves its parent usable', async () => {
    mockFetch();
    const loader = createCoreLoader();
    const parent = loader.createScope({ name: 'world' });
    const child = parent.createScope({ name: 'chunk' });

    const chunkHandle = child.get('chunk.png');
    await chunkHandle.loaded;

    child.destroy();

    expect(chunkHandle.loadState).toBe('loading');

    const parentHandle = parent.get('hero.png');
    await parentHandle.loaded;

    expect(parentHandle.loadState).toBe('ready');
    expect(loader.inspect().filter(row => row.claims > 0)).toHaveLength(1);
  });

  test('destroying a parent destroys the children it still has', async () => {
    mockFetch();
    const loader = createCoreLoader();
    const parent = loader.createScope({ name: 'world' });
    const child = parent.createScope({ name: 'chunk' });

    const handle = child.get('chunk.png');
    await handle.loaded;

    parent.destroy();

    expect(handle.loadState).toBe('loading');
    expect(loader.inspect()).toHaveLength(0);
  });

  test('a parent destroy reaches every descendant', async () => {
    mockFetch();
    const loader = createCoreLoader();
    const root = loader.createScope({ name: 'world' });
    const child = root.createScope({ name: 'region' });
    const grandchild = child.createScope({ name: 'chunk' });

    const handles = [root.get('hero.png'), child.get('region.png'), grandchild.get('chunk.png')];
    await Promise.all(handles.map(handle => handle.loaded));

    expect(loader.inspect()).toHaveLength(3);

    root.destroy();

    expect(loader.inspect()).toHaveLength(0);
    for (const handle of handles) {
      expect(handle.loadState).toBe('loading');
    }
  });

  test('an already destroyed child does not disturb the parent destroy', async () => {
    mockFetch();
    const loader = createCoreLoader();
    const parent = loader.createScope({ name: 'world' });
    const first = parent.createScope({ name: 'chunk-a' });
    const second = parent.createScope({ name: 'chunk-b' });

    const kept = second.get('chunk-b.png');
    await Promise.all([first.get('chunk-a.png').loaded, kept.loaded]);

    first.destroy();

    expect(() => parent.destroy()).not.toThrow();
    expect(kept.loadState).toBe('loading');
    expect(loader.inspect()).toHaveLength(0);
  });

  test('destroy is idempotent and never releases a claim another owner took later', async () => {
    mockFetch();
    const loader = createCoreLoader();
    const parent = loader.createScope({ name: 'world' });
    const child = parent.createScope({ name: 'chunk' });
    const other = loader.createScope({ name: 'hud' });

    const handle = child.get('hero.png');
    await handle.loaded;

    child.destroy();
    child.destroy();

    // The claim the child dropped was the last one, so the payload was evicted
    // and the handle re-armed; claiming it again heals that same handle.
    await other.get('hero.png').loaded;

    expect(handle.loadState).toBe('ready');

    parent.destroy();

    expect(loader.inspect()[0]?.claims).toBe(1);
    expect(handle.loadState).toBe('ready');
  });

  test('a scene scope destroys the scopes created under it', async () => {
    mockFetch();
    const loader = createCoreLoader();
    const app = { loader } as unknown as Application;
    const sceneLoader = new SceneLoader(app);
    const world = sceneLoader.createScope({ name: 'world' });
    const chunk = world.createScope({ name: 'chunk' });

    const handle = chunk.get('chunk.png');
    await handle.loaded;

    sceneLoader.destroy();

    expect(handle.loadState).toBe('loading');
    expect(loader.inspect()).toHaveLength(0);
  });
});

describe('dependency scopes', () => {
  test("a sub-asset stays owned by its own dependency scope, not by the claimer's hierarchy", async () => {
    mockFetch();
    const loader = createCoreLoader();
    const parent = loader.createScope({ name: 'world' });
    const child = parent.createScope({ name: 'chunk' });

    const font = await child.load(Asset.type('bmFont', 'fonts/ui.fnt'));
    const page = font.textures[0]!;

    const pageOwners = loader.inspect().find(row => row.locator.endsWith('fonts/page0.png'))?.owners ?? [];

    expect(pageOwners.map(owner => owner.kind)).toEqual(['dependency']);

    // The dependency scope hangs off the font asset, so releasing the font
    // through its claimer is what frees the page - not a hierarchy walk.
    child.destroy();

    expect(page.loadState).toBe('loading');
    expect(loader.inspect()).toHaveLength(0);

    const kept = parent.get('hero.png');
    await kept.loaded;

    expect(kept.loadState).toBe('ready');
  });
});
