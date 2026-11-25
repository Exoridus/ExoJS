import { animatedImageMime } from '#rendering/texture/animatedImageMime';
import { ImageSequenceSource } from '#rendering/texture/ImageSequenceSource';
import { isNativeDecoderFaithful } from '#rendering/texture/nativeDecoderProbe';

const urls = import.meta.glob('../../fixtures/animated/*', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

const load = async (name: string): Promise<ArrayBuffer> => {
  const response = await fetch(urls[`../../fixtures/animated/${name}`]!);

  return response.arrayBuffer();
};

type Rgba = readonly [number, number, number, number];

/** Sampled points of the 32x32 fixtures; see the fixture README for the frame layout. */
const points = { topLeft: [4, 4], middle: [12, 12], lowerLeft: [25, 28], lowerRight: [28, 28], right: [30, 28] } as const;

const blue: Rgba = [0, 0, 255, 255];
const clear: Rgba = [0, 0, 0, 0];
const red: Rgba = [255, 0, 0, 255];
const green: Rgba = [0, 255, 0, 255];

type Expectation = Partial<Record<keyof typeof points, Rgba>>;

// Disposal and blend differ per container: GIF and APNG can restore the previous
// canvas, WebP cannot; GIF has no partial alpha, APNG and WebP do.
const expected: Record<string, readonly Expectation[]> = {
  'animated.gif': [
    { topLeft: blue, middle: blue, right: blue },
    { topLeft: blue, middle: red, right: blue },
    { topLeft: green, middle: blue, right: blue },
    { topLeft: clear, middle: blue, lowerLeft: [255, 255, 0, 255], right: blue },
  ],
  'animated.png': [
    { topLeft: blue, middle: blue, lowerRight: blue },
    { topLeft: blue, middle: red, lowerRight: blue },
    { topLeft: green, middle: blue, lowerRight: blue },
    { topLeft: clear, middle: blue, lowerRight: [128, 128, 255, 255] },
    { topLeft: clear, middle: blue, lowerRight: [255, 255, 255, 128] },
  ],
  'animated.webp': [
    { topLeft: blue, middle: blue, lowerRight: blue },
    { topLeft: blue, middle: red, lowerRight: blue },
    { topLeft: green, middle: red, lowerRight: blue },
    { topLeft: clear, middle: red, lowerRight: [128, 128, 255, 255] },
    { topLeft: clear, middle: red, lowerRight: [255, 255, 255, 128] },
  ],
};

const durations: Record<string, readonly number[]> = {
  'animated.gif': [100, 200, 300, 100],
  'animated.png': [100, 200, 300, 100, 100],
  'animated.webp': [100, 200, 300, 100, 100],
};

const sampleCanvas = document.createElement('canvas');
const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true })!;

const read = (source: ImageSequenceSource, [x, y]: readonly [number, number]): Rgba => {
  sampleCanvas.width = source.width;
  sampleCanvas.height = source.height;
  sampleContext.clearRect(0, 0, source.width, source.height);
  sampleContext.drawImage(source.image as CanvasImageSource, 0, 0);

  const data = sampleContext.getImageData(x, y, 1, 1).data;

  return [data[0]!, data[1]!, data[2]!, data[3]!];
};

const expectClose = (actual: Rgba, wanted: Rgba, label: string): void => {
  for (let channel = 0; channel < 4; channel++) {
    expect(
      Math.abs(actual[channel]! - wanted[channel]!),
      `${label} channel ${channel}: ${actual.join(',')} vs ${wanted.join(',')}`,
    ).toBeLessThanOrEqual(3);
  }
};

const NativeDecoder = (globalThis as { ImageDecoder?: Parameters<typeof isNativeDecoderFaithful>[0] }).ImageDecoder;
const nativeAvailable = NativeDecoder !== undefined;
const mimeOf: Record<string, 'image/gif' | 'image/png' | 'image/webp'> = { gif: 'image/gif', png: 'image/png', webp: 'image/webp' };

/** The decoder a given file must end up with: native only where the browser's decoder composes faithfully. */
const expectedKind = async (mode: 'native' | 'compositing', name: string): Promise<'native' | 'compositing'> =>
  mode === 'native' && (await isNativeDecoderFaithful(NativeDecoder!, mimeOf[name.split('.').pop()!]!)) ? 'native' : 'compositing';
const modes: ReadonlyArray<'native' | 'compositing'> = nativeAvailable ? ['native', 'compositing'] : ['compositing'];

/** Hides ImageDecoder so the software compositor is the only available decoder. */
const withDecoder = async <T>(mode: 'native' | 'compositing', run: () => Promise<T>): Promise<T> => {
  const holder = globalThis as { ImageDecoder?: unknown };
  const original = holder.ImageDecoder;

  if (mode === 'compositing') {
    holder.ImageDecoder = undefined;
  }

  try {
    return await run();
  } finally {
    holder.ImageDecoder = original;
  }
};

const collectFrames = async (
  source: ImageSequenceSource,
  count: number,
  deadlineMs = 6000,
): Promise<{ at: number[]; pixels: Rgba[][]; names: Array<keyof typeof points> }> => {
  const at: number[] = [performance.now()];
  const pixelsAt = (): Rgba[] => (Object.values(points) as Array<readonly [number, number]>).map(point => read(source, point));
  const pixels: Rgba[][] = [pixelsAt()];

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timed out waiting for frames')), deadlineMs);

    source.onFrame.add(() => {
      at.push(performance.now());
      pixels.push(pixelsAt());

      if (pixels.length === count) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  return { at, pixels, names: Object.keys(points) as Array<keyof typeof points> };
};

describe('animated image decoding in a real browser', () => {
  test('reports the environment under test', () => {
    console.info(`animated-images environment: ${navigator.userAgent}; ImageDecoder=${nativeAvailable}`);
    expect(modes.length).toBeGreaterThan(0);
  });

  test('the native decoder probe agrees with the pixels a real fixture decodes to', async () => {
    if (NativeDecoder === undefined) {
      return;
    }

    const Decoder = NativeDecoder as unknown as new (options: { data: Uint8Array; type: string }) => {
      tracks: { ready: Promise<void> };
      decode(options: { frameIndex: number }): Promise<{ image: VideoFrame }>;
      close(): void;
    };

    for (const name of ['animated.gif', 'animated.png', 'animated.webp']) {
      const type = mimeOf[name.split('.').pop()!]!;
      const decoder = new Decoder({ data: new Uint8Array(await load(name)), type });

      await decoder.tracks.ready;

      // Frame 3 follows a frame disposed to background, and for APNG/WebP frame 4 uses the "source" blend.
      const { image } = await decoder.decode({ frameIndex: 3 });

      sampleCanvas.width = 32;
      sampleCanvas.height = 32;
      sampleContext.clearRect(0, 0, 32, 32);
      sampleContext.drawImage(image, 0, 0);
      image.close();

      const nativeDisposesCorrectly = sampleContext.getImageData(4, 4, 1, 1).data[3]! < 16;

      let nativeBlendsCorrectly = true;

      if (type !== 'image/gif') {
        const second = await decoder.decode({ frameIndex: 4 });

        sampleContext.clearRect(0, 0, 32, 32);
        sampleContext.drawImage(second.image, 0, 0);
        second.image.close();
        nativeBlendsCorrectly = sampleContext.getImageData(28, 28, 1, 1).data[0]! > 250;
      }

      decoder.close();

      const faithful = await isNativeDecoderFaithful(NativeDecoder, type);

      console.info(`animated-images native ${name}: disposal=${nativeDisposesCorrectly} blend=${nativeBlendsCorrectly} probe=${faithful}`);
      expect({ name, faithful }).toEqual({ name, faithful: nativeDisposesCorrectly && nativeBlendsCorrectly });
    }
  });

  for (const name of Object.keys(expected)) {
    for (const mode of modes) {
      test(`${name} via ${mode}: composes frames with the authored disposal and blend rules, then loops`, async () => {
        const encoded = await load(name);

        expect(animatedImageMime(encoded)).not.toBeNull();

        await withDecoder(mode, async () => {
          const source = await ImageSequenceSource.open(encoded);

          try {
            expect(source.decoderKind).toBe(await expectedKind(mode, name));
            expect([source.width, source.height]).toEqual([32, 32]);

            const frames = expected[name]!;
            const { pixels, names } = await collectFrames(source, frames.length + 1);

            for (let index = 0; index <= frames.length; index++) {
              const want = frames[index % frames.length]!;

              names.forEach((point, pointIndex) => {
                const wanted = want[point];

                if (wanted !== undefined) {
                  expectClose(pixels[index]![pointIndex]!, wanted, `${name}/${mode} frame ${index % frames.length} ${point}`);
                }
              });
            }
          } finally {
            source.destroy();
          }
        });
      });

      test(`${name} via ${mode}: frames follow the authored durations without accumulating drift`, async () => {
        const encoded = await load(name);

        await withDecoder(mode, async () => {
          const source = await ImageSequenceSource.open(encoded);

          try {
            const wanted = durations[name]!;
            const { at } = await collectFrames(source, wanted.length * 2 + 1);
            const total = wanted.reduce((sum, value) => sum + value, 0);

            for (let index = 1; index < at.length; index++) {
              const interval = at[index]! - at[index - 1]!;
              const target = wanted[(index - 1) % wanted.length]!;

              expect(Math.abs(interval - target), `interval ${index}: ${interval.toFixed(1)}ms vs ${target}ms`).toBeLessThan(60);
            }

            // Two full cycles must take two authored cycles, not two cycles plus accumulated decode latency.
            expect(Math.abs(at[at.length - 1]! - at[0]! - total * 2)).toBeLessThan(80);
          } finally {
            source.destroy();
          }
        });
      });
    }
  }

  for (const mode of modes) {
    test(`a GIF without a loop extension plays once and stops on its last frame via ${mode}`, async () => {
      const encoded = await load('animated-once.gif');

      await withDecoder(mode, async () => {
        const source = await ImageSequenceSource.open(encoded);

        try {
          const revisions: number[] = [];

          source.onFrame.add(() => revisions.push(source.revision));
          await new Promise(resolve => setTimeout(resolve, 600));

          expect(revisions).toHaveLength(1);
          expect(source.playing).toBe(false);
          expectClose(read(source, [12, 12]), red, 'last frame stays displayed');

          source.play();
          await new Promise(resolve => setTimeout(resolve, 600));

          expect(source.playing).toBe(false);
          expect(revisions.length).toBeGreaterThanOrEqual(2);
        } finally {
          source.destroy();
        }
      });
    });

    test(`pause keeps the remaining frame time and resume continues the sequence via ${mode}`, async () => {
      const encoded = await load('animated.png');

      await withDecoder(mode, async () => {
        const source = await ImageSequenceSource.open(encoded);

        try {
          const seen: number[] = [];

          source.onFrame.add(() => seen.push(performance.now()));
          source.pause();

          const before = source.revision;

          await new Promise(resolve => setTimeout(resolve, 400));
          expect(source.revision).toBe(before);

          const resumedAt = performance.now();

          source.play();
          await new Promise(resolve => setTimeout(resolve, 250));

          expect(seen).toHaveLength(1);
          expect(seen[0]! - resumedAt).toBeGreaterThan(40);
          expect(seen[0]! - resumedAt).toBeLessThan(160);
        } finally {
          source.destroy();
        }
      });
    });

    test(`playback rate scales every authored duration via ${mode}`, async () => {
      const encoded = await load('animated.png');

      await withDecoder(mode, async () => {
        const source = await ImageSequenceSource.open(encoded);

        try {
          source.playbackRate = 2;

          const { at } = await collectFrames(source, 4);
          const wanted = [50, 100, 150];

          for (let index = 1; index < at.length; index++) {
            expect(Math.abs(at[index]! - at[index - 1]! - wanted[index - 1]!)).toBeLessThan(45);
          }
        } finally {
          source.destroy();
        }
      });
    });
  }

  test('a pending software decode cannot change the paused canvas', async () => {
    const encoded = await load('animated.png');

    await withDecoder('compositing', async () => {
      const original = globalThis.createImageBitmap;
      let resumeDecode!: () => void;
      let signalDecoded!: () => void;

      const gate = new Promise<void>(resolve => {
        resumeDecode = resolve;
      });
      const decoded = new Promise<void>(resolve => {
        signalDecoded = resolve;
      });
      let calls = 0;

      const bitmap = async (blob: ImageBitmapSource, options?: ImageBitmapOptions): Promise<ImageBitmap> => {
        const call = ++calls;
        const result = await original(blob, options);

        if (call === 2) {
          await gate;
          signalDecoded();
        }

        return result;
      };

      globalThis.createImageBitmap = bitmap as typeof createImageBitmap;
      let source: ImageSequenceSource | null = null;

      try {
        source = await ImageSequenceSource.open(encoded);
        await new Promise(resolve => setTimeout(resolve, 150));
        source.pause();
        expect(source.revision).toBe(1);
        resumeDecode();
        await decoded;
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(source.revision).toBe(1);
        expectClose(read(source, points.middle), blue, 'paused frame pixels');
        source.play();
        expect(source.revision).toBe(2);
        expectClose(read(source, points.middle), red, 'resumed frame pixels');
      } finally {
        resumeDecode();
        source?.destroy();
        globalThis.createImageBitmap = original;
      }
    });
  });

  test('static files and single-frame animations are not treated as animated', async () => {
    for (const name of ['static.gif', 'static.png', 'static.webp', 'single-frame.png']) {
      expect([name, animatedImageMime(await load(name))]).toEqual([name, null]);
    }
  });
});
