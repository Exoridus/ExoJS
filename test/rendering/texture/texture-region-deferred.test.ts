import { NineSliceSprite, RepeatingSprite, Texture, TextureRegion } from '#rendering/public';

// A loader handle reports 0x0 until its payload lands and the same object is
// updated in place. Anything that captures its dimensions at construction keeps
// the zeros; a whole-texture region derives them instead.
const makeDeferredTexture = () => {
  let resolve!: () => void;
  const loaded = new Promise<Texture>(res => {
    resolve = () => res(texture);
  });
  const own = (value: unknown) => ({ value, writable: true, enumerable: true, configurable: true });
  let version = 0;
  const texture = Object.create(Texture.prototype, {
    width: own(0),
    height: own(0),
    flipY: own(false),
    ready: own(false),
    loaded: own(loaded),
    destroyed: own(false),
    updateSource: own(() => undefined),
    version: { get: () => version, configurable: true },
  }) as Texture;

  return {
    texture,
    finishLoad: (width: number, height: number) => {
      const stub = texture as unknown as { width: number; height: number; ready: boolean };

      stub.width = width;
      stub.height = height;
      stub.ready = true;
      version++;
      resolve();
    },
  };
};

const makeReadyTexture = (width: number, height: number): Texture => {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  return new Texture(canvas);
};

describe('TextureRegion over a whole texture', () => {
  test('accepts a texture that has not loaded yet and follows its dimensions', () => {
    const { texture, finishLoad } = makeDeferredTexture();
    const region = new TextureRegion(texture);

    expect(region.width).toBe(0);
    expect(region.height).toBe(0);

    finishLoad(64, 32);

    expect(region.width).toBe(64);
    expect(region.height).toBe(32);
  });

  test('covers the full UV range regardless of when the payload lands', () => {
    const { texture, finishLoad } = makeDeferredTexture();
    const region = new TextureRegion(texture);

    expect([region.u0, region.v0, region.u1, region.v1]).toEqual([0, 0, 1, 1]);

    finishLoad(128, 64);

    expect([region.u0, region.v0, region.u1, region.v1]).toEqual([0, 0, 1, 1]);
    expect([region.x, region.y]).toEqual([0, 0]);
  });

  test('an explicit sub-region still rejects a texture without dimensions', () => {
    const { texture } = makeDeferredTexture();

    expect(() => new TextureRegion(texture, { x: 0, y: 0, width: 16, height: 16 })).toThrow(/positive dimensions/);
  });

  test('an explicit sub-region keeps its captured geometry', () => {
    const region = new TextureRegion(makeReadyTexture(64, 64), { x: 16, y: 8, width: 32, height: 16 });

    expect([region.x, region.y, region.width, region.height]).toEqual([16, 8, 32, 16]);
    expect([region.u0, region.v0]).toEqual([0.25, 0.125]);
  });
});

describe('scalable sprites built from a deferred texture', () => {
  test('RepeatingSprite constructs and picks up the size once the texture loads', () => {
    const { texture, finishLoad } = makeDeferredTexture();
    const sprite = new RepeatingSprite(texture, { width: 100, height: 50 });

    expect(sprite.region.width).toBe(0);

    finishLoad(32, 32);

    expect(sprite.region.width).toBe(32);
    expect(sprite.region.height).toBe(32);
  });

  test('RepeatingSprite rebuilds its geometry-path quads after the texture loads', () => {
    const { texture, finishLoad } = makeDeferredTexture();
    // A TextureRegion source selects the geometry path, where quads are built
    // from the region rather than left to the shader.
    const sprite = new RepeatingSprite(new TextureRegion(texture), { width: 100, height: 50 });

    expect(sprite.quads).toHaveLength(0);

    finishLoad(32, 32);

    expect(sprite.quads.length).toBeGreaterThan(0);
  });

  test('NineSliceSprite constructs and builds its quads once the texture loads', () => {
    const { texture, finishLoad } = makeDeferredTexture();
    const sprite = new NineSliceSprite(texture, { slices: 8, width: 120, height: 90 });

    expect(sprite.region.width).toBe(0);

    finishLoad(48, 48);

    expect(sprite.region.width).toBe(48);
    expect(sprite.quads).toHaveLength(9);
  });

  test('slices that cannot fit the loaded texture are still rejected, at the first build', () => {
    const { texture, finishLoad } = makeDeferredTexture();
    const sprite = new NineSliceSprite(texture, { slices: 40, width: 120, height: 90 });

    finishLoad(16, 16);

    expect(() => sprite.quads).toThrow(/exceeds region width/);
  });

  test('slices exceeding an already-loaded texture are rejected at construction', () => {
    expect(() => new NineSliceSprite(makeReadyTexture(16, 16), { slices: 40, width: 120, height: 90 })).toThrow(/exceeds region width/);
  });
});
