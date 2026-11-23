import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader } from '#assets/Loader';
import { materializeAssetTypes } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';

const animatedGif = (): ArrayBuffer =>
  Uint8Array.from([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0,
    0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 0,
    0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 0, 0x3b,
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
    global.fetch = vi.fn(async (): Promise<Response> => ({
      ok: true,
      arrayBuffer: async () => animatedGif(),
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test('two path handles reuse one decoder, observe changed frames, and release on final scope teardown', async () => {
    const loader = new Loader({ basePath: '/' });

    materializeAssetTypes(loader, coreAssetTypes);

    const scope = loader.createScope();
    const a = new Texture('fire.gif');
    const b = new Texture('fire.gif');

    expect(await scope.load(a)).toBe(a);
    expect(await scope.load(b)).toBe(b);
    expect(createDecoder).toHaveBeenCalledTimes(1);
    expect(a.width).toBe(16);
    expect(b.width).toBe(16);

    const firstA = a.version;
    const firstB = b.version;

    await vi.advanceTimersByTimeAsync(20);

    expect(a.version).toBeGreaterThan(firstA);
    expect(b.version).toBeGreaterThan(firstB);
    const stable = a.version;
    expect(a.version).toBe(stable);

    scope.destroy();

    expect(closeDecoder).toHaveBeenCalledTimes(1);
    loader.destroy();
  });
});
