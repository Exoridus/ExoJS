import { textureSeamlessAdapter } from '#assets/seamless';
import { Rectangle } from '#math/Rectangle';
import { Mesh } from '#rendering/mesh/Mesh';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { TextureRegion } from '#rendering/texture/TextureRegion';

/**
 * A drawable that derives its geometry from a texture's dimensions has to
 * announce a content change when a deferred handle finally reports them.
 * Rebuilding on the next read is not enough on its own: a retained product
 * decides whether to replay from the node's revisions alone and never visits a
 * node it skipped, so a subtree recorded around the empty geometry replays it
 * for as long as nothing else invalidates - which is how a still-loading
 * texture used to leave a node permanently blank.
 */

/** A loader handle before its payload lands, updated in place like the real one. */
const makePendingTexture = (): { texture: Texture; finishLoad: () => void } => {
  const texture = Object.create(Texture.prototype) as Texture;
  const own = (value: unknown) => ({ value, writable: true, configurable: true, enumerable: true });
  let version = 0;
  let resolveLoaded!: () => void;
  const loaded = new Promise<Texture>(resolve => {
    resolveLoaded = () => resolve(texture);
  });

  Object.defineProperties(texture, {
    width: own(0),
    height: own(0),
    source: own(null),
    ready: own(false),
    destroyed: own(false),
    loaded: own(loaded),
    updateSource: own(() => {}),
    addDestroyListener: own(() => texture),
    removeDestroyListener: own(() => texture),
    version: { get: () => version, configurable: true },
  });

  return {
    texture,
    finishLoad: () => {
      Object.defineProperties(texture, { width: own(64), height: own(64), source: own({}), ready: own(true) });
      version++;
      resolveLoaded();
    },
  };
};

/** Whether the node's content revision moved once the texture finished loading. */
const announcesLoad = async (build: (texture: Texture) => { _contentRevision: number }): Promise<boolean> => {
  const { texture, finishLoad } = makePendingTexture();
  const node = build(texture);
  const before = node._contentRevision;

  finishLoad();
  // The heal paths are promise continuations, so they land a microtask later.
  await new Promise(resolve => setTimeout(resolve, 0));

  return node._contentRevision !== before;
};

describe('a drawable whose geometry follows its texture invalidates when a deferred handle lands', () => {
  test('Sprite', async () => {
    await expect(announcesLoad(texture => new Sprite(texture) as unknown as { _contentRevision: number })).resolves.toBe(true);
  });

  test('NineSliceSprite', async () => {
    await expect(
      announcesLoad(
        texture => new NineSliceSprite(texture, { slices: 4, width: 100, height: 100 }) as unknown as { _contentRevision: number },
      ),
    ).resolves.toBe(true);
  });

  test('RepeatingSprite over a bare texture', async () => {
    await expect(
      announcesLoad(texture => new RepeatingSprite(texture, { width: 100, height: 100 }) as unknown as { _contentRevision: number }),
    ).resolves.toBe(true);
  });

  test('RepeatingSprite over a whole-texture region', async () => {
    await expect(
      announcesLoad(
        texture => new RepeatingSprite(new TextureRegion(texture), { width: 100, height: 100 }) as unknown as { _contentRevision: number },
      ),
    ).resolves.toBe(true);
  });

  test('Mesh', async () => {
    // A mesh brings its own vertices and UVs, so nothing about its geometry
    // follows the texture - but a mesh whose texture has not loaded is skipped
    // by the renderers rather than drawn white, and a skipped draw recorded
    // into a retained product would never be revisited.
    await expect(
      announcesLoad(
        texture =>
          new Mesh({
            vertices: new Float32Array([0, 0, 10, 0, 10, 10, 0, 10]),
            uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
            indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
            texture,
          }) as unknown as { _contentRevision: number },
      ),
    ).resolves.toBe(true);
  });

  test('a Mesh whose texture is assigned while it is still loading', async () => {
    const { texture, finishLoad } = makePendingTexture();
    const mesh = new Mesh({
      vertices: new Float32Array([0, 0, 10, 0, 10, 10, 0, 10]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
    });

    mesh.texture = texture;

    const before = (mesh as unknown as { _contentRevision: number })._contentRevision;

    finishLoad();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect((mesh as unknown as { _contentRevision: number })._contentRevision).not.toBe(before);
  });

  test('a Sprite whose frame was chosen before the payload landed', async () => {
    // A Spritesheet slices frames out of an atlas that may still be loading, so
    // the frame is set while the texture reports 0x0. UVs are the frame over
    // those dimensions, so they have to be recomputed once the real ones
    // arrive - and the load has to be announced, or a retained product goes on
    // replaying the recording it made around the empty texture.
    const { texture, finishLoad } = makePendingTexture();
    const sprite = new Sprite(texture);

    sprite.setTextureFrame(new Rectangle(16, 0, 16, 16));

    const revisionBefore = (sprite as unknown as { _contentRevision: number })._contentRevision;

    expect([...sprite.texCoords]).toEqual([0, 0, 0, 0]);

    finishLoad();
    await new Promise(resolve => setTimeout(resolve, 0));

    // The frame stands; against the 64x64 payload it spans u 0.25 to 0.5 and
    // v 0 to 0.25, packed as two 16-bit fixed-point values per corner.
    expect([...sprite.texCoords]).toEqual([0x3fff, 0x7fff, 0x3fff7fff, 0x3fff3fff]);
    expect((sprite as unknown as { _contentRevision: number })._contentRevision).not.toBe(revisionBefore);
  });
});

describe('a drawable invalidates when a failed deferred texture is retried', () => {
  test.each([
    ['Sprite', (texture: Texture) => new Sprite(texture)],
    ['NineSliceSprite', (texture: Texture) => new NineSliceSprite(texture, { slices: 4, width: 100, height: 100 })],
    ['RepeatingSprite', (texture: Texture) => new RepeatingSprite(texture, { width: 100, height: 100 })],
    [
      'Mesh',
      (texture: Texture) =>
        new Mesh({
          vertices: new Float32Array([0, 0, 10, 0, 10, 10, 0, 10]),
          uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
          indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
          texture,
        }),
    ],
  ] as const)('%s announces the successful retry', async (_name, build) => {
    const texture = textureSeamlessAdapter.createPlaceholder();
    const node = build(texture);

    textureSeamlessAdapter.fail(texture, new Error('first attempt failed'));
    await new Promise(resolve => setTimeout(resolve, 0));

    const before = node._contentRevision;
    textureSeamlessAdapter.begin(texture);
    const donor = Texture.fromPixels({
      levels: [{ width: 64, height: 64, data: new Uint8Array(64 * 64 * 4) }],
      colorSpace: 'srgb',
      alphaMode: 'premultiplied',
    });

    textureSeamlessAdapter.fill(texture, donor);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(texture.ready).toBe(true);
    expect(node._contentRevision).not.toBe(before);

    if (node instanceof Sprite) {
      expect(node.textureFrame.width).toBe(64);
      expect(node.textureFrame.height).toBe(64);
    }

    node.destroy();
    texture.destroy();
    donor.destroy();
  });
});

describe('deferred texture retries preserve lifecycle boundaries', () => {
  const donor = (): Texture =>
    Texture.fromPixels({
      levels: [{ width: 8, height: 8, data: new Uint8Array(8 * 8 * 4) }],
      colorSpace: 'srgb',
      alphaMode: 'premultiplied',
    });

  test('repeated failures still reject each public attempt before a successful heal', async () => {
    const texture = textureSeamlessAdapter.createPlaceholder();
    const sprite = new Sprite(texture);

    for (let attempt = 0; attempt < 2; attempt++) {
      const pending = texture.loaded;
      const error = new Error(`attempt ${attempt}`);
      const rejection = pending.catch(reason => reason);

      textureSeamlessAdapter.fail(texture, error);
      expect(await rejection).toBe(error);
      textureSeamlessAdapter.begin(texture);
    }

    const loaded = texture.loaded;
    const payload = donor();
    textureSeamlessAdapter.fill(texture, payload);
    await expect(loaded).resolves.toBe(texture);
    await Promise.resolve();

    expect(sprite.textureFrame.width).toBe(8);
    expect(sprite.textureFrame.height).toBe(8);
    sprite.destroy();
    texture.destroy();
    payload.destroy();
  });

  test('a successful retry cannot replace the frame of a sprite that changed textures', async () => {
    const texture = textureSeamlessAdapter.createPlaceholder();
    const sprite = new Sprite(texture);
    textureSeamlessAdapter.fail(texture, new Error('failed'));
    await Promise.resolve();

    const replacement = donor();
    sprite.texture = replacement;
    sprite.setTextureFrame(new Rectangle(2, 1, 3, 4));
    textureSeamlessAdapter.begin(texture);
    textureSeamlessAdapter.fill(texture, replacement);
    await Promise.resolve();

    expect(sprite.texture).toBe(replacement);
    expect(sprite.textureFrame.x).toBe(2);
    expect(sprite.textureFrame.y).toBe(1);
    expect(sprite.textureFrame.width).toBe(3);
    expect(sprite.textureFrame.height).toBe(4);
    sprite.destroy();
    texture.destroy();
    replacement.destroy();
  });

  test('successful retries do not invalidate destroyed drawables', async () => {
    const texture = textureSeamlessAdapter.createPlaceholder();
    const sprite = new Sprite(texture);
    const revision = sprite._contentRevision;
    textureSeamlessAdapter.fail(texture, new Error('failed'));
    await Promise.resolve();
    sprite.destroy();

    const payload = donor();
    textureSeamlessAdapter.begin(texture);
    textureSeamlessAdapter.fill(texture, payload);
    await Promise.resolve();

    expect(sprite._contentRevision).toBe(revision);
    texture.destroy();
    payload.destroy();
  });

  test('destroying a texture before its successful continuation does not heal a sprite from freed dimensions', async () => {
    const texture = textureSeamlessAdapter.createPlaceholder();
    const sprite = new Sprite(texture);
    const revision = sprite._contentRevision;
    const payload = donor();

    textureSeamlessAdapter.fill(texture, payload);
    texture.destroy();
    await Promise.resolve();

    expect(sprite._contentRevision).toBe(revision);
    expect(sprite.textureFrame.width).toBe(0);
    expect(sprite.textureFrame.height).toBe(0);
    sprite.destroy();
    payload.destroy();
  });
});
