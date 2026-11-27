import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader } from '#assets/Loader';
import { materializeAssetTypes } from '#extensions/materialize';
import { AnimatedTexture } from '#rendering/texture/AnimatedTexture';
import { Texture } from '#rendering/texture/Texture';

const animatedGif = (): ArrayBuffer =>
  Uint8Array.from([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 0,
    0x3b,
  ]).buffer;

const originalFetch = global.fetch;
const frames: Array<{ close: ReturnType<typeof vi.fn> }> = [];
const closeDecoder = vi.fn();
const createDecoder = vi.fn();

class FakeImageDecoder {
  public readonly tracks = {
    ready: Promise.resolve(),
    selectedTrack: { frameCount: 2 },
  };

  public constructor(_options: { data: Uint8Array; type: string }) {
    createDecoder();
  }

  public async decode(_options: { frameIndex: number }): Promise<{ image: VideoFrame }> {
    const frame = { displayWidth: 16, displayHeight: 8, duration: 20_000, close: vi.fn() };

    frames.push(frame);

    return { image: frame as unknown as VideoFrame };
  }

  public close(): void {
    closeDecoder();
  }
}

describe('animated images through normal texture assets', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    frames.length = 0;
    closeDecoder.mockClear();
    createDecoder.mockClear();
    vi.stubGlobal('ImageDecoder', FakeImageDecoder);
    global.fetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => animatedGif(),
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test('path handles and typed B+ descriptors share one decoder, update frames, and release on final scope teardown', async () => {
    const loader = new Loader({ basePath: '/' });

    materializeAssetTypes(loader, coreAssetTypes);

    const scope = loader.createScope();
    const a = new Texture('fire.gif');
    const b = new Texture('fire.gif');

    expect(await scope.load(a)).toBe(a);
    expect(await scope.load(b)).toBe(b);

    // A typed B+ descriptor must reuse the same animated texture residency as
    // directly constructed Texture handles, not open a second decoder.
    const viaDescriptor = await scope.load({ type: Texture, source: 'fire.gif' });

    expect(viaDescriptor).toBeInstanceOf(Texture);
    expect(createDecoder).toHaveBeenCalledTimes(1);
    expect(a.width).toBe(16);
    expect(b.width).toBe(16);

    const firstA = a.version;
    const firstB = b.version;
    const firstDescriptor = viaDescriptor.version;

    await vi.advanceTimersByTimeAsync(20);

    expect(a.version).toBeGreaterThan(firstA);
    expect(b.version).toBeGreaterThan(firstB);
    expect(viaDescriptor.version).toBeGreaterThan(firstDescriptor);
    const stable = a.version;
    expect(a.version).toBe(stable);

    scope.destroy();

    expect(closeDecoder).toHaveBeenCalledTimes(1);
    loader.destroy();
  });

  test('joining an animated asset preserves the shared playback state until the final owner releases it', async () => {
    const loader = new Loader({ basePath: '/' });

    materializeAssetTypes(loader, coreAssetTypes);

    const first = loader.createScope();
    const second = loader.createScope();
    const a = new AnimatedTexture('fire.gif');
    const b = new AnimatedTexture('fire.gif');

    try {
      expect(await first.load(a)).toBe(a);
      a.playbackRate = 2;
      a.loop = false;
      a.pause();

      expect(await second.load(b)).toBe(b);
      expect(createDecoder).toHaveBeenCalledTimes(1);
      expect(b.playbackRate).toBe(2);
      expect(b.loop).toBe(false);
      expect(b.playing).toBe(false);

      b.playbackRate = 3;
      b.loop = true;
      b.play();

      expect(a.playbackRate).toBe(3);
      expect(a.loop).toBe(true);
      expect(a.playing).toBe(true);
      a.pause();
      expect(b.playing).toBe(false);

      first.destroy();
      expect(closeDecoder).not.toHaveBeenCalled();
      expect(b.ready).toBe(true);
      b.play();
      const version = b.version;

      await vi.advanceTimersByTimeAsync(20);

      expect(b.version).toBeGreaterThan(version);
      second.destroy();
      expect(closeDecoder).toHaveBeenCalledTimes(1);
      expect(frames.every(frame => frame.close.mock.calls.length === 1)).toBe(true);
    } finally {
      loader.destroy();
    }
  });

  test('only explicit unloaded playback requests are applied once to the shared animation', async () => {
    const loader = new Loader({ basePath: '/' });

    materializeAssetTypes(loader, coreAssetTypes);

    const scope = loader.createScope();
    const a = new AnimatedTexture('fire.gif');
    const b = new AnimatedTexture('fire.gif');

    try {
      a.playbackRate = 2;
      a.loop = false;
      a.pause();

      expect(await scope.load(a)).toBe(a);
      expect(a.playbackRate).toBe(2);
      expect(a.loop).toBe(false);
      expect(a.playing).toBe(false);

      // Even default-valued settings and play are explicit commands here.
      b.playbackRate = 1;
      b.loop = true;
      b.play();

      expect(await scope.load(b)).toBe(b);
      expect(a.playbackRate).toBe(1);
      expect(a.loop).toBe(true);
      expect(a.playing).toBe(true);

      b.playbackRate = 3;
      b.loop = false;
      b.pause();
      scope.destroy();

      expect(closeDecoder).toHaveBeenCalledTimes(1);

      const next = loader.createScope();

      expect(await next.load(a)).toBe(a);
      expect(createDecoder).toHaveBeenCalledTimes(2);
      expect(a.playbackRate).toBe(1);
      expect(a.loop).toBe(true);
      expect(a.playing).toBe(true);
      expect(b.playbackRate).toBe(1);
      expect(b.loop).toBe(true);
      expect(b.playing).toBe(true);

      next.destroy();
      expect(closeDecoder).toHaveBeenCalledTimes(2);
    } finally {
      loader.destroy();
    }
  });
});
