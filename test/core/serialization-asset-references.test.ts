import { Asset } from '#assets/Asset';
import { Assets } from '#assets/Assets';
import { binarySourceCodec } from '#assets/AssetSourceCodec';
import { AssetType } from '#assets/AssetType';
import { coreAssetTypes } from '#assets/coreAssetTypes';
import { TextureFactory } from '#assets/factories/TextureFactory';
import { Loader } from '#assets/Loader';
import { logger } from '#core/Logger';
import { SceneNode } from '#core/SceneNode';
import { Prefab } from '#core/serialization/Prefab';
import { registerSerializer } from '#core/serialization/SerializationRegistry';
import { _resetDefaultSerializers, deserializeTree, migrate, serializeTree } from '#core/serialization/serialize';
import { SERIALIZATION_VERSION, type SerializedNode } from '#core/serialization/types';
import { materializeAssetTypes } from '#extensions/materialize';
import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { ScaleModes, WrapModes } from '#rendering/types';

import typedScene from '../fixtures/scene-asset-references-v4.json';

const createCoreLoader = (resolution = 1): Loader => {
  const loader = new Loader({ basePath: '/' });
  materializeAssetTypes(loader, coreAssetTypes);
  loader.variants.profile = { textureFormats: [], resolution };

  return loader;
};

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn(
    async (): Promise<Response> =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        arrayBuffer: async () => new ArrayBuffer(8),
        text: async () => '',
        json: async () => ({}),
      }) as unknown as Response,
  ) as unknown as typeof fetch;
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 4, height: 4, close() {} })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  global.fetch = originalFetch;
  _resetDefaultSerializers();
});

const textures = (node: SceneNode): Array<Texture | RenderTexture | null> =>
  (node as Container).children.map(child => (child as Sprite).texture);

describe('asset references keep their interpretation', () => {
  test('format 3 Sprite demands its typed texture only after scene attachment', async () => {
    const loader = createCoreLoader();
    const owner = loader.createScope();
    const prefab = Prefab.fromJSON({
      version: 4,
      root: {
        type: 'Container',
        children: [
          {
            type: 'Sprite',
            texture: { $type: 'texture', source: 'hero.png', options: { textureOptions: { scaleMode: ScaleModes.Nearest } } },
          },
        ],
      },
    });
    const root = prefab.instantiate(loader) as Container;
    const sprite = root.children[0] as Sprite;

    expect(global.fetch).not.toHaveBeenCalled();
    const texture = sprite.texture as Texture;
    expect(texture).toBeInstanceOf(Texture);
    expect(texture.scaleMode).toBe(ScaleModes.Nearest);

    root._setAssetScope(owner);
    await expect(texture.loaded).resolves.toBe(texture);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(sprite.texture).toBe(texture);
    expect(texture.source).not.toBeNull();

    root._setAssetScope(null);
    expect(texture.source).toBeNull();
    owner.destroy();
    loader.destroy();
  });

  test('the current format writes the typed reference format 3 introduced', async () => {
    const loader = createCoreLoader();
    const texture = await loader.load(Asset.type('texture', 'hero.png'));
    const tree = new Container();
    tree.addChild(new Sprite(texture));

    const saved = { version: SERIALIZATION_VERSION, root: serializeTree(tree, loader) };

    expect(saved).toEqual(typedScene);

    const prefab = Prefab.fromJSON(typedScene);
    expect(prefab.toJSON()).toEqual(typedScene);
    expect(textures(prefab.instantiate(loader))[0]).toBeInstanceOf(Texture);
  });

  test('resolve claims without a fetch, shares identical references and heals on explicit scoped load', async () => {
    const loader = createCoreLoader();
    const owner = loader.createScope();
    let handle: unknown;
    let distinct: Texture | null = null;

    class LazyProbe extends SceneNode {}

    registerSerializer('LazyProbe', LazyProbe, {
      write: () => ({}),
      read: (data, ctx) => {
        expect(handle).toBeUndefined();
        handle = ctx.resolve(data.texture, Texture);
        expect(ctx.resolve({ source: 'hero.png', $type: 'texture' }, Texture)).toBe(handle);
        const nearest = ctx.resolve(
          { source: 'hero.png', $type: 'texture', options: { textureOptions: { scaleMode: ScaleModes.Nearest } } },
          Texture,
        );

        if (!(nearest instanceof Texture)) {
          throw new Error('Expected a texture handle');
        }

        distinct = nearest;

        return new LazyProbe();
      },
    });

    deserializeTree({ type: 'LazyProbe', texture: { $type: 'texture', source: 'hero.png' } }, loader, undefined, 3, undefined, owner);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(handle).toBeInstanceOf(Texture);
    const texture = handle as Texture;
    expect(texture.source).toBeNull();

    expect(await owner.load('hero.png')).toBe(texture);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(texture.source).not.toBeNull();
    expect(distinct).not.toBe(texture);
    expect(distinct).toMatchObject({ scaleMode: ScaleModes.Nearest, source: texture.source });

    owner.destroy();
    expect(texture.source).toBeNull();
    loader.destroy();
  });

  test.each([
    ['missing-type', /hero\.png.*missing-type/],
    ['image', /image.*texture|texture.*image/],
  ])('lazy resolution refuses a %s reference before any network request', ($type, message) => {
    const loader = createCoreLoader();

    class LazyProbe extends SceneNode {}

    registerSerializer('LazyProbe', LazyProbe, {
      write: () => ({}),
      read: (data, ctx) => {
        ctx.resolve({ $type: 'texture', source: 'provisional.png' }, Texture);
        ctx.resolve(data.texture, Texture);

        return new LazyProbe();
      },
    });

    expect(() => deserializeTree({ type: 'LazyProbe', texture: { $type, source: 'hero.png' } }, loader)).toThrow(message);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(loader.inspect()).toEqual([]);
  });

  test.each([{}, { mimeType: 'image/png' }])('two texture handles keep their own sampler while sharing a decode (%j)', async options => {
    const loader = createCoreLoader();
    const first = { scaleMode: ScaleModes.Nearest, wrapMode: WrapModes.Repeat };
    const second = { scaleMode: ScaleModes.Linear, wrapMode: WrapModes.MirroredRepeat };
    const catalog = Assets.from({
      first: { type: 'texture', source: 'hero.png', ...options, textureOptions: first },
      second: { type: 'texture', source: 'hero.png', ...options, textureOptions: second },
    });
    const preload = loader.createScope();

    await preload.load(catalog);

    expect(catalog.first).not.toBe(catalog.second);
    expect(catalog.first.source).toBe(catalog.second.source);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.createImageBitmap).toHaveBeenCalledTimes(1);

    const tree = new Container();
    tree.addChild(new Sprite(catalog.first), new Sprite(catalog.second));
    const document = serializeTree(tree, loader);
    const saved = (document.children as SerializedNode[]).map(child => child.texture);

    expect(saved).toEqual([
      { $type: 'texture', source: 'hero.png', options: { ...options, textureOptions: first } },
      { $type: 'texture', source: 'hero.png', options: { ...options, textureOptions: second } },
    ]);

    const restored = deserializeTree(document, loader, undefined, 2) as Container;
    const a = restored.children[0] as Sprite;
    const b = restored.children[1] as Sprite;
    const [firstTexture, secondTexture] = textures(restored);

    expect(firstTexture).not.toBe(secondTexture);
    expect(firstTexture).toMatchObject(first);
    expect(secondTexture).toMatchObject(second);
    expect(serializeTree(restored, loader)).toEqual(document);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const source = catalog.first.source;
    preload.destroy();
    expect(firstTexture?.source).toBe(source);
    expect(secondTexture?.source).toBe(source);
    a.destroy();
    expect(secondTexture?.source).toBe(source);
    b.destroy();
    expect(loader.inspect()).toEqual([]);

    restored.destroy();
    tree.destroy();
    loader.destroy();
  });

  test('replacing the built-in Texture factory preserves per-handle sampler serialization', async () => {
    const loader = createCoreLoader();
    loader._assetTypes.define(Texture, { type: 'texture', loader: new TextureFactory() });
    const textureOptions = { scaleMode: ScaleModes.Nearest, wrapMode: WrapModes.Repeat };
    const catalog = Assets.from({ hero: { type: 'texture', source: 'hero.png', textureOptions } });

    try {
      await loader.load(catalog);
      expect(serializeTree(new Sprite(catalog.hero), loader).texture).toEqual({
        $type: 'texture',
        source: 'hero.png',
        options: { textureOptions },
      });
    } finally {
      loader.destroy();
    }
  });

  test('a typed reference resolves only when its type matches the serialized field', async () => {
    const loader = createCoreLoader();
    const texture = await loader.load('hero.png');
    const root: SerializedNode = {
      type: 'Container',
      children: [
        { type: 'Sprite', texture: { $type: 'texture', source: 'hero.png' } },
        { type: 'Sprite', texture: { $type: 'sound', source: 'hero.png' } },
      ],
    };

    expect(textures(deserializeTree(root, loader, undefined, 2))).toEqual([texture, null]);

    loader.destroy();
  });

  test('a default sampler is saved explicitly when the resident payload has a different sampler', async () => {
    const loader = createCoreLoader();
    const nearest = { scaleMode: ScaleModes.Nearest, wrapMode: WrapModes.Repeat };
    const defaults = { scaleMode: Texture.defaultOptions.scaleMode, wrapMode: Texture.defaultOptions.wrapMode };
    await loader.load(Asset.type('texture', 'hero.png', { textureOptions: nearest }));
    const catalog = Assets.from({ hero: { type: 'texture', source: 'hero.png' } });

    try {
      await loader.load(catalog);
      const saved = serializeTree(new Sprite(catalog.hero), loader);
      expect(saved.texture).toEqual({ $type: 'texture', source: 'hero.png', options: { textureOptions: defaults } });
      const sprite = deserializeTree(saved, loader, undefined, 2) as Sprite;
      expect(sprite.texture).toMatchObject(defaults);
      sprite.destroy();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    } finally {
      loader.destroy();
    }
  });

  test('a failed serializer releases its preloaded sampler lease without releasing the preload', async () => {
    class FailingNode extends SceneNode {}

    const loader = createCoreLoader();
    const preload = loader.createScope();
    const error = new Error('Failed after reading texture');
    let leased: Texture | null = null;
    registerSerializer('FailingNode', FailingNode, {
      write: () => ({}),
      read: (data, ctx) => {
        leased = ctx.resolveAsset(data.texture, Texture);

        throw error;
      },
    });

    try {
      await preload.load('hero.png');
      const texture = { source: 'hero.png', options: { textureOptions: { scaleMode: ScaleModes.Nearest } } };
      expect(() => deserializeTree({ type: 'FailingNode', texture }, loader)).toThrow(error);
      expect(leased).toMatchObject({ destroyed: true });
      expect(loader.inspect()).toMatchObject([{ claims: 1 }]);
      preload.destroy();
      expect(loader.inspect()).toEqual([]);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    } finally {
      loader.destroy();
    }
  });

  test('treats a legacy null textureOptions record as absent alongside MIME identity', async () => {
    const loader = createCoreLoader();
    const options = { mimeType: 'image/png', textureOptions: null } as unknown as { mimeType: string };

    try {
      const texture = await loader.load(Asset.type('texture', 'hero.png', options));
      const document = { type: 'Sprite', texture: { source: 'hero.png', options } };
      expect((deserializeTree(document, loader) as Sprite).texture).toBe(texture);
    } finally {
      loader.destroy();
    }
  });

  test('two textures of one source with different identity options round-trip to their own texture', async () => {
    const loader = createCoreLoader();
    const plain = await loader.load(Asset.type('texture', 'hero.png'));
    const data = await loader.load(Asset.type('texture', 'hero.png', { mimeType: 'image/png', textureOptions: { colorSpace: 'none' } }));

    expect(data).not.toBe(plain);

    const tree = new Container();
    tree.addChild(new Sprite(plain), new Sprite(data));

    const serialized = serializeTree(tree, loader);
    const restored = deserializeTree(JSON.parse(JSON.stringify(serialized)) as SerializedNode, loader, undefined, 2);

    const [restoredPlain, restoredData] = textures(restored);

    expect(restoredPlain).toBe(plain);
    expect(restoredData).toBe(data);

    const [plainRef, dataRef] = ((serialized.children ?? []) as SerializedNode[]).map(child => child.texture);

    expect(plainRef).toEqual({ $type: 'texture', source: 'hero.png' });
    expect(dataRef).toEqual({
      $type: 'texture',
      source: 'hero.png',
      options: { mimeType: 'image/png', textureOptions: { colorSpace: 'none' } },
    });
  });

  test('a reference whose asset was not pre-loaded still resolves to null with a diagnostic', async () => {
    const source = createCoreLoader();
    const texture = await source.load(Asset.type('texture', 'hero.png', { textureOptions: { colorSpace: 'none' } }));
    const tree = new Container();
    tree.addChild(new Sprite(texture));

    const serialized = serializeTree(tree, source);
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const target = createCoreLoader();

    await target.load(Asset.type('texture', 'hero.png'));

    const restored = deserializeTree(serialized, target, undefined, 2);

    expect(textures(restored)).toEqual([null]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('hero.png'), expect.objectContaining({ source: 'serialize' }));
  });

  test('documents are written with the current format version', () => {
    expect(SERIALIZATION_VERSION).toBe(4);
    expect(() => migrate({ version: SERIALIZATION_VERSION + 1, root: { type: 'Container' } })).toThrow(/newer than the supported version/);
  });

  test('an identity option that cannot be represented as data refuses the save instead of dropping it', async () => {
    const shape = { kind: 'circle', toJSON: undefined as unknown, transform: () => 1 };

    class ShapedType extends AssetType<unknown, { readonly shape: unknown }, { shape: typeof shape }> {
      public readonly id = 'com.example.shaped';
      public override readonly codec = binarySourceCodec;

      public override resourceIdentity({ options }: { options?: { shape: typeof shape } }): string {
        return typeof options?.shape.transform === 'function' ? 'shape=transformed' : '';
      }

      public createFactory() {
        return { create: async (_source: unknown, context: { options?: { shape: typeof shape } }) => ({ shape: context.options?.shape }) };
      }
    }

    class Holder extends SceneNode {
      public resource: object | null = null;
    }

    registerSerializer('Holder', Holder, {
      write: (node, ctx) => ({ resource: ctx.keyFor(node.resource) }),
      read: () => new Holder(),
    });

    const loader = createCoreLoader();
    const type = new ShapedType();

    materializeAssetTypes(loader, [type]);

    const holder = new Holder();
    holder.resource = (await loader.load(type.asset('a.shape', { shape }))) as object;

    expect(() => serializeTree(holder, loader)).toThrow(/cannot be written as data/);
  });
});

describe('asset references keep the logical source', () => {
  test('a path-backed texture no scope has claimed yet still serializes its source and sampler', () => {
    const loader = createCoreLoader();

    expect(serializeTree(new Sprite(new Texture('hero.png')), loader).texture).toEqual({ $type: 'texture', source: 'hero.png' });
    expect(serializeTree(new Sprite(new Texture('hero.png', { scaleMode: ScaleModes.Nearest })), loader).texture).toEqual({
      $type: 'texture',
      source: 'hero.png',
      options: { textureOptions: { scaleMode: ScaleModes.Nearest, wrapMode: WrapModes.ClampToEdge } },
    });
    loader.destroy();
  });

  test('a live handle keeps its authored variant alias when another logical source shares its payload', async () => {
    const loader = createCoreLoader();
    loader.variants.define('hero@{1,2}x.png', [{ source: 'hero.png' }]);

    const explicit = await loader.load('hero.png');
    const handle = new Texture('hero@{1,2}x.png');
    const leaf = handle._pathAsset();

    expect(leaf).not.toBeNull();
    loader.get(leaf!);
    await handle.loaded;

    expect(handle.source).toBe(explicit.source);
    expect(serializeTree(new Sprite(handle), loader).texture).toEqual({ $type: 'texture', source: 'hero@{1,2}x.png' });
    expect(() => serializeTree(new Sprite(explicit), loader)).toThrow(/more than one logical source/);
    loader.destroy();
  });

  const defineTerrain = (loader: Loader): void => {
    loader.variants.define('terrain.png', [{ source: 'terrain@2x.png', resolution: 2 }, { source: 'terrain.png' }]);
  };

  test('a save made where one variant was chosen resolves the variant another device pre-loaded', async () => {
    const highDensity = createCoreLoader(2);
    const lowDensity = createCoreLoader(1);

    defineTerrain(highDensity);
    defineTerrain(lowDensity);

    const sharp = await highDensity.load('terrain.png');
    const plain = await lowDensity.load('terrain.png');

    expect(highDensity.inspect()[0]?.locator).toBe('url:/terrain@2x.png');
    expect(lowDensity.inspect()[0]?.locator).toBe('url:/terrain.png');

    const tree = new Container();
    tree.addChild(new Sprite(sharp));

    const serialized = serializeTree(tree, highDensity);

    expect((serialized.children as SerializedNode[])[0]?.texture).toEqual({ $type: 'texture', source: 'terrain.png' });
    expect(textures(deserializeTree(serialized, lowDensity, undefined, 2))[0]).toBe(plain);
  });

  test('one resource reached through two logical sources is reported, not written as whichever came first', async () => {
    const loader = createCoreLoader();

    loader.variants.define('a.png', [{ source: 'shared.png' }]);
    loader.variants.define('b.png', [{ source: 'shared.png' }]);

    const first = await loader.load('a.png');
    const second = await loader.load('b.png');

    expect(second).toBe(first);

    const tree = new Container();
    tree.addChild(new Sprite(first));

    expect(() => serializeTree(tree, loader)).toThrow(/reached through more than one logical source.*"a\.png".*"b\.png"/);
  });

  test('loading the same logical source twice is not an ambiguity', async () => {
    const loader = createCoreLoader();
    const texture = await loader.load('hero.png');

    await loader.load(Asset.type('texture', 'hero.png'));

    const tree = new Container();
    tree.addChild(new Sprite(texture));

    expect((serializeTree(tree, loader).children as SerializedNode[])[0]?.texture).toEqual({ $type: 'texture', source: 'hero.png' });
  });
});
