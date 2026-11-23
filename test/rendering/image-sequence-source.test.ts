import { ImageSequenceSource } from '#rendering/texture/ImageSequenceSource';

const gif = (): ArrayBuffer =>
  Uint8Array.from([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 0,
    0x3b,
  ]).buffer;

const images: Array<{ close: ReturnType<typeof vi.fn> }> = [];
const closeDecoder = vi.fn();

class FakeImageDecoder {
  public readonly tracks = {
    ready: Promise.resolve(),
    selectedTrack: { frameCount: 2 },
  };

  public async decode(_options: { frameIndex: number }): Promise<{ image: VideoFrame }> {
    const frame = { displayWidth: 16, displayHeight: 8, duration: 20_000, close: vi.fn() };

    images.push(frame);

    return { image: frame as unknown as VideoFrame };
  }

  public close(): void {
    closeDecoder();
  }
}

describe('ImageSequenceSource', () => {
  beforeEach(() => {
    images.length = 0;
    closeDecoder.mockClear();
    vi.useFakeTimers();
    vi.stubGlobal('ImageDecoder', FakeImageDecoder);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test('decodes the first frame, advances at authored durations and keeps a stable revision between frames', async () => {
    const source = await ImageSequenceSource.open(gif());
    const changed = vi.fn();

    source.onFrame.add(changed);

    expect(source.width).toBe(16);
    expect(source.height).toBe(8);
    expect(source.revision).toBe(1);
    expect(source.revision).toBe(1);

    await vi.advanceTimersByTimeAsync(20);

    expect(source.revision).toBe(2);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(images).toHaveLength(2);

    source.pause();
    await vi.advanceTimersByTimeAsync(100);
    expect(source.revision).toBe(2);

    source.destroy();
    expect(closeDecoder).toHaveBeenCalledTimes(1);
    expect(images[0]!.close).toHaveBeenCalledTimes(1);
    expect(images[1]!.close).toHaveBeenCalledTimes(1);
  });

  test('a finite loop stops at the last frame', async () => {
    const source = await ImageSequenceSource.open(gif());

    source.loop = false;
    await vi.advanceTimersByTimeAsync(40);

    expect(source.revision).toBe(2);
    expect(source.playing).toBe(false);
    source.destroy();
  });

  test('throws instead of silently freezing animation without an ImageDecoder', async () => {
    vi.stubGlobal('ImageDecoder', undefined);

    await expect(ImageSequenceSource.open(gif())).rejects.toThrow(/ImageDecoder API/);
  });

  test('rejects non-animated files before allocating a decoder', async () => {
    await expect(ImageSequenceSource.open(new Uint8Array([1, 2, 3]).buffer)).rejects.toThrow(/requires an animated/);
    expect(closeDecoder).not.toHaveBeenCalled();
  });
});
