import { Rectangle, Texture } from '@codexo/exojs';

import { ParticleSystem } from '../src/ParticleSystem';

// A deferred texture handle (`loader.get(...)`) starts 0x0 until its payload
// arrives. A system constructed from one snaps its frame to 0x0, which sizes
// every particle quad to nothing - the system simulates but draws no pixels
// until the frame picks up the real dimensions.
const makeDeferredTexture = () => {
  let resolve!: () => void;
  const loaded = new Promise<Texture>(res => {
    resolve = () => res(texture);
  });
  // Own data properties, defined rather than assigned: `Texture`'s real
  // accessors would route the writes into backing state this stub does not have.
  const own = (value: unknown) => ({ value, writable: true, enumerable: true, configurable: true });
  const texture = Object.create(Texture.prototype, {
    width: own(0),
    height: own(0),
    flipY: own(false),
    ready: own(false),
    loaded: own(loaded),
    destroyed: own(false),
    updateSource: own(() => undefined),
  }) as Texture;

  return {
    texture,
    finishLoad: (width: number, height: number) => {
      const stub = texture as unknown as { width: number; height: number; ready: boolean };

      stub.width = width;
      stub.height = height;
      stub.ready = true;
      resolve();
    },
  };
};

describe('ParticleSystem deferred texture', () => {
  test('starts with an empty frame while the texture is still loading', () => {
    const { texture } = makeDeferredTexture();
    const system = new ParticleSystem(texture, { capacity: 4 });

    expect(system.textureFrame.width).toBe(0);
    expect(Array.from(system.vertices)).toEqual([0, 0, 0, 0]);
  });

  test('heals the frame and the quad vertices once the texture finishes loading', async () => {
    const { texture, finishLoad } = makeDeferredTexture();
    const system = new ParticleSystem(texture, { capacity: 4 });

    finishLoad(64, 32);
    await texture.loaded;
    await Promise.resolve();

    expect(system.textureFrame.width).toBe(64);
    expect(system.textureFrame.height).toBe(32);
    expect(Array.from(system.vertices)).toEqual([-32, -16, 32, 16]);
  });

  test('keeps an explicit frame set while the texture was loading', async () => {
    const { texture, finishLoad } = makeDeferredTexture();
    const system = new ParticleSystem(texture, { capacity: 4 });

    system.setTextureFrame(new Rectangle(8, 8, 16, 16));

    finishLoad(128, 128);
    await texture.loaded;
    await Promise.resolve();

    expect(system.textureFrame.x).toBe(8);
    expect(system.textureFrame.width).toBe(16);
    expect(system.textureFrame.height).toBe(16);
  });

  test('heals a texture assigned after construction', async () => {
    const { texture, finishLoad } = makeDeferredTexture();
    const system = new ParticleSystem({ capacity: 4 });

    system.setTexture(texture);

    expect(system.textureFrame.width).toBe(0);

    finishLoad(16, 16);
    await texture.loaded;
    await Promise.resolve();

    expect(system.textureFrame.width).toBe(16);
    expect(system.textureFrame.height).toBe(16);
  });
});
