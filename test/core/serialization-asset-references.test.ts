import { Asset } from '#assets/Asset';
import { binarySourceCodec } from '#assets/AssetSourceCodec';
import { AssetType } from '#assets/AssetType';
import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader } from '#assets/Loader';
import { logger } from '#core/Logger';
import { SceneNode } from '#core/SceneNode';
import { registerSerializer } from '#core/serialization/SerializationRegistry';
import { _resetDefaultSerializers, deserializeTree, migrate, serializeTree } from '#core/serialization/serialize';
import { SERIALIZATION_VERSION, type SerializedNode } from '#core/serialization/types';
import { materializeAssetTypes } from '#extensions/materialize';
import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';

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
  test('two textures of one source with different identity options round-trip to their own texture', async () => {
    const loader = createCoreLoader();
    const plain = await loader.load(Asset.type('texture', 'hero.png'));
    const data = await loader.load(Asset.type('texture', 'hero.png', { mimeType: 'image/png', textureOptions: { colorSpace: 'none' } }));

    expect(data).not.toBe(plain);

    const tree = new Container();
    tree.addChild(new Sprite(plain), new Sprite(data));

    const serialized = serializeTree(tree, loader);
    const restored = deserializeTree(JSON.parse(JSON.stringify(serialized)) as SerializedNode, loader);

    const [restoredPlain, restoredData] = textures(restored);

    expect(restoredPlain).toBe(plain);
    expect(restoredData).toBe(data);

    const [plainRef, dataRef] = ((serialized.children ?? []) as SerializedNode[]).map(child => child.texture);

    // A reference that needs no options keeps the compact string form.
    expect(plainRef).toBe('hero.png');
    expect(dataRef).toEqual({ source: 'hero.png', options: { mimeType: 'image/png', textureOptions: { colorSpace: 'none' } } });
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

    const restored = deserializeTree(serialized, target);

    expect(textures(restored)).toEqual([null]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('hero.png'), expect.objectContaining({ source: 'serialize' }));
  });

  test('legacy string references of a version 1 document stay readable', async () => {
    const loader = createCoreLoader();
    const texture = await loader.load(Asset.type('texture', 'hero.png'));
    const legacy = migrate({ version: 1, root: { type: 'Container', children: [{ type: 'Sprite', texture: 'hero.png' }] } });

    expect(legacy.version).toBe(1);
    expect(textures(deserializeTree(legacy.root, loader))[0]).toBe(texture);
  });

  test('documents are written with the current format version', () => {
    expect(SERIALIZATION_VERSION).toBe(2);
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

    expect((serialized.children as SerializedNode[])[0]?.texture).toBe('terrain.png');
    expect(textures(deserializeTree(serialized, lowDensity))[0]).toBe(plain);
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

    expect((serializeTree(tree, loader).children as SerializedNode[])[0]?.texture).toBe('hero.png');
  });
});
