import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { demuxAnimatedImage } from '#rendering/texture/animatedImageDemux';
import type { AnimatedImageMime } from '#rendering/texture/animatedImageMime';

const fixture = (name: string): ArrayBuffer => {
  const bytes = readFileSync(join(__dirname, '../fixtures/animated', name));

  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

const summarize = (name: string, type: AnimatedImageMime) =>
  demuxAnimatedImage(fixture(name), type)!.frames.map(frame => [
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    frame.durationMs,
    frame.dispose,
    frame.blend,
  ]);

describe('animated image demuxer', () => {
  test('GIF: placement, delays, disposal and loop count come from the container', () => {
    const animation = demuxAnimatedImage(fixture('animated.gif'), 'image/gif')!;

    expect([animation.width, animation.height, animation.repetitions]).toEqual([32, 32, Number.POSITIVE_INFINITY]);
    expect(summarize('animated.gif', 'image/gif')).toEqual([
      [0, 0, 32, 32, 100, 'none', 'over'],
      [8, 8, 16, 16, 200, 'previous', 'over'],
      [0, 0, 8, 8, 300, 'background', 'over'],
      [24, 24, 8, 8, 100, 'none', 'over'],
    ]);
  });

  test('a GIF without a loop extension repeats zero times', () => {
    expect(demuxAnimatedImage(fixture('animated-once.gif'), 'image/gif')!.repetitions).toBe(0);
  });

  test('APNG: fcTL delay, disposal and blend are decoded, and every frame gets a valid standalone PNG', () => {
    const animation = demuxAnimatedImage(fixture('animated.png'), 'image/png')!;

    expect(animation.repetitions).toBe(Number.POSITIVE_INFINITY);
    expect(summarize('animated.png', 'image/png')).toEqual([
      [0, 0, 32, 32, 100, 'none', 'source'],
      [8, 8, 16, 16, 200, 'previous', 'source'],
      [0, 0, 8, 8, 300, 'background', 'source'],
      [24, 24, 8, 8, 100, 'none', 'over'],
      [24, 24, 8, 8, 100, 'none', 'source'],
    ]);

    for (const frame of animation.frames) {
      const still = frame.still();

      expect(Array.from(still.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(new DataView(still.buffer, still.byteOffset).getUint32(16)).toBe(frame.width);
    }
  });

  test('WebP: ANMF offsets, durations, dispose and blend are decoded, with a standalone RIFF per frame', () => {
    const animation = demuxAnimatedImage(fixture('animated.webp'), 'image/webp')!;

    expect([animation.width, animation.height, animation.repetitions]).toEqual([32, 32, Number.POSITIVE_INFINITY]);
    expect(summarize('animated.webp', 'image/webp')).toEqual([
      [0, 0, 32, 32, 100, 'none', 'source'],
      [8, 8, 16, 16, 200, 'none', 'source'],
      [0, 0, 8, 8, 300, 'background', 'source'],
      [24, 24, 8, 8, 100, 'none', 'over'],
      [24, 24, 8, 8, 100, 'none', 'source'],
    ]);

    for (const frame of animation.frames) {
      const still = frame.still();
      const text = String.fromCharCode(...still.subarray(0, 4), ...still.subarray(8, 16));

      expect(text).toBe('RIFFWEBPVP8X');
      expect(new DataView(still.buffer, still.byteOffset).getUint32(4, true)).toBe(still.length - 8);
    }
  });

  test('single-frame and static files are not animations', () => {
    expect(demuxAnimatedImage(fixture('static.gif'), 'image/gif')).toBeNull();
    expect(demuxAnimatedImage(fixture('single-frame.png'), 'image/png')).toBeNull();
    expect(demuxAnimatedImage(fixture('static.webp'), 'image/webp')).toBeNull();
  });

  test('truncated or corrupt containers are rejected instead of throwing', () => {
    for (const [name, type] of [
      ['animated.gif', 'image/gif'],
      ['animated.png', 'image/png'],
      ['animated.webp', 'image/webp'],
    ] as const) {
      const bytes = fixture(name);

      for (const cut of [10, 20, bytes.byteLength - 5]) {
        expect(() => demuxAnimatedImage(bytes.slice(0, cut), type)).not.toThrow();
      }
    }
  });
});
