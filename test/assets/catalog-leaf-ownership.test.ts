import { Assets } from '#assets/Assets';
import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader } from '#assets/Loader';
import { materializeAssetTypes } from '#extensions/materialize';

const createCoreLoader = (): Loader => {
  const loader = new Loader({ basePath: '/' });
  materializeAssetTypes(loader, coreAssetTypes);

  return loader;
};

const originalFetch = global.fetch;

const mockFetch = (): void => {
  global.fetch = vi.fn(
    async (): Promise<Response> =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        text: async () => '{"hp":3}',
        json: async () => ({ hp: 3 }),
        arrayBuffer: async () => new ArrayBuffer(8),
      }) as unknown as Response,
  ) as unknown as typeof fetch;
};

const foreignLoader = /already belongs to another loader/;

describe('a catalog leaf belongs to one loader', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 4, height: 4 })),
    );
    mockFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  test('a second application loader is rejected before it changes anything the first one serves', async () => {
    const catalog = Assets.from({ data: 'level.json', hero: 'hero.png' });
    const loaderA = createCoreLoader();
    const loaderB = createCoreLoader();
    const scopeA = loaderA.createScope({ name: 'A' });
    const scopeB = loaderB.createScope({ name: 'B' });

    await scopeA.load(catalog);

    expect(() => scopeB.load(catalog)).toThrow(foreignLoader);
    expect(() => scopeB.get(catalog)).toThrow(foreignLoader);
    expect(() => scopeB.load(catalog.hero)).toThrow(foreignLoader);
    expect(() => loaderB.get(catalog.data)).toThrow(foreignLoader);

    expect(catalog.data.state).toBe('ready');
    expect(catalog.data.value).toEqual({ hp: 3 });
    expect(catalog.hero.loadState).toBe('ready');
    expect(catalog.hero.width).toBe(4);
    expect(loaderB.inspect()).toHaveLength(0);
    expect(loaderA.inspect().map(row => row.owners.map(owner => owner.name))).toEqual([['A'], ['A']]);
  });

  test('a catalog with one leaf already bound elsewhere is rejected as a whole', async () => {
    const catalog = Assets.from({ data: 'level.json', hero: 'hero.png' });
    const loaderA = createCoreLoader();
    const loaderB = createCoreLoader();

    await loaderA.createScope({ name: 'A' }).load(catalog.hero);

    expect(() => loaderB.createScope({ name: 'B' }).load(catalog)).toThrow(foreignLoader);

    // The unbound leaf was not adopted, fetched or bound by the rejected batch.
    expect(catalog.data.state).toBe('idle');
    expect(loaderB.inspect()).toHaveLength(0);

    await loaderA.createScope({ name: 'A2' }).load(catalog);

    expect(catalog.data.state).toBe('ready');
  });

  test('catalogs created per application load side by side', async () => {
    const createCatalog = () => Assets.from({ data: 'level.json', hero: 'hero.png' });
    const loaderA = createCoreLoader();
    const loaderB = createCoreLoader();
    const catalogA = createCatalog();
    const catalogB = createCatalog();

    await Promise.all([loaderA.createScope({ name: 'A' }).load(catalogA), loaderB.createScope({ name: 'B' }).load(catalogB)]);

    expect(catalogA.hero.width).toBe(4);
    expect(catalogB.hero.width).toBe(4);
    expect(catalogA.hero).not.toBe(catalogB.hero);
  });

  test('scopes of the same loader share a catalog freely', async () => {
    const catalog = Assets.from({ data: 'level.json', hero: 'hero.png' });
    const loader = createCoreLoader();
    const level = loader.createScope({ name: 'level' });
    const hud = loader.createScope({ name: 'hud' });

    await level.load(catalog);
    await hud.load(catalog);

    level.destroy();

    expect(catalog.hero.loadState).toBe('ready');
    expect(loader.inspect().map(row => row.owners.map(owner => owner.name))).toEqual([['hud'], ['hud']]);
  });

  test('the binding outlives the loader: a destroyed loader does not hand its leaves to the next one', async () => {
    const catalog = Assets.from({ data: 'level.json', hero: 'hero.png' });
    const loaderA = createCoreLoader();

    await loaderA.createScope({ name: 'A' }).load(catalog);
    loaderA.destroy();

    const loaderB = createCoreLoader();

    expect(() => loaderB.createScope({ name: 'B' }).load(catalog)).toThrow(foreignLoader);

    const fresh = Assets.from({ data: 'level.json', hero: 'hero.png' });

    await loaderB.createScope({ name: 'B' }).load(fresh);

    expect(fresh.hero.loadState).toBe('ready');
  });
});
