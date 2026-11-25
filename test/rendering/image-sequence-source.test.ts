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

  test.each([true, false])('retains one pending decode across pause/resume (resume before completion: %s)', async resumeEarly => {
    let resumeDecode!: () => void;

    const gate = new Promise<void>(resolve => {
      resumeDecode = resolve;
    });
    const calls = vi.fn();

    class DeferredDecoder extends FakeImageDecoder {
      public override async decode(options: { frameIndex: number }): Promise<{ image: VideoFrame }> {
        calls(options.frameIndex);

        if (options.frameIndex === 1) {
          await gate;
        }

        return super.decode(options);
      }
    }

    vi.stubGlobal('ImageDecoder', DeferredDecoder);

    const source = await ImageSequenceSource.open(gif());
    const changed = vi.fn();

    source.onFrame.add(changed);

    try {
      await vi.advanceTimersByTimeAsync(20);
      expect(calls.mock.calls).toEqual([[0], [1]]);
      source.pause();

      if (resumeEarly) {
        source.play();
        await vi.advanceTimersByTimeAsync(100);
        expect(calls.mock.calls).toEqual([[0], [1]]);
      }

      resumeDecode();
      await vi.advanceTimersByTimeAsync(0);

      if (!resumeEarly) {
        expect(source.revision).toBe(1);
        expect(changed).not.toHaveBeenCalled();
        source.play();
      }

      expect(source.revision).toBe(2);
      expect(changed).toHaveBeenCalledTimes(1);
      expect(calls.mock.calls).toEqual([[0], [1]]);
    } finally {
      resumeDecode();
      source.destroy();
    }

    expect(images).toHaveLength(2);
    expect(images.every(image => image.close.mock.calls.length === 1)).toBe(true);
    expect(closeDecoder).toHaveBeenCalledTimes(1);
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

  describe('repeat count, restart and failure reporting', () => {
    const fakeWith = (repetitionCount: number | undefined, decode?: () => Promise<{ image: VideoFrame }>): void => {
      class Counted extends FakeImageDecoder {
        public override readonly tracks = { ready: Promise.resolve(), selectedTrack: { frameCount: 2, repetitionCount } };

        public override async decode(options: { frameIndex: number }): Promise<{ image: VideoFrame }> {
          return decode === undefined ? super.decode(options) : decode();
        }
      }

      vi.stubGlobal('ImageDecoder', Counted);
    };

    test('plays the authored repeat count from the file, ignoring what the decoder reports, then stops on the last frame', async () => {
      // The fixture GIF has no loop extension, so it plays once however the engine counts repeats.
      fakeWith(Number.POSITIVE_INFINITY);

      const source = await ImageSequenceSource.open(gif());

      await vi.advanceTimersByTimeAsync(200);

      expect(source.playing).toBe(false);
      expect(source.revision).toBe(2);

      source.destroy();
    });

    test('play() after the sequence finished restarts it from the first frame', async () => {
      fakeWith(0);

      const source = await ImageSequenceSource.open(gif());

      await vi.advanceTimersByTimeAsync(200);
      expect(source.playing).toBe(false);

      source.play();
      await vi.advanceTimersByTimeAsync(0);

      expect(source.playing).toBe(true);
      expect(source.revision).toBe(3);

      source.destroy();
    });

    test('reports a failing frame decode through onError instead of freezing silently', async () => {
      let calls = 0;

      fakeWith(undefined, async () => {
        calls++;

        if (calls > 1) {
          throw new Error('decode failed');
        }

        return { image: { displayWidth: 16, displayHeight: 8, duration: 20_000, close: vi.fn() } as unknown as VideoFrame };
      });

      const source = await ImageSequenceSource.open(gif());
      const failed = vi.fn();

      source.onError.add(failed);
      await vi.advanceTimersByTimeAsync(40);

      expect(failed).toHaveBeenCalledTimes(1);
      expect(source.playing).toBe(false);

      source.destroy();
    });

    test('opening fails loudly when neither ImageDecoder nor createImageBitmap exists', async () => {
      vi.stubGlobal('ImageDecoder', undefined);
      vi.stubGlobal('createImageBitmap', undefined);

      await expect(ImageSequenceSource.open(gif())).rejects.toThrow(/ImageDecoder API or createImageBitmap/);
    });
  });
});
