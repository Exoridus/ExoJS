import { animatedImageMime } from '#rendering/texture/animatedImageMime';

const bytes = (...values: number[]): ArrayBuffer => Uint8Array.from(values).buffer;
const ascii = (text: string): number[] => [...text].map(char => char.charCodeAt(0));

const gif = (frameCount: number): ArrayBuffer => {
  const values = [...ascii('GIF89a'), 1, 0, 1, 0, 0, 0, 0];

  for (let i = 0; i < frameCount; i++) {
    // Image descriptor, LZW minimum code size, empty data sub-block.
    values.push(0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 0);
  }

  return bytes(...values, 0x3b);
};

const chunk = (name: string, data: readonly number[]): number[] => [
  (data.length >>> 24) & 255,
  (data.length >>> 16) & 255,
  (data.length >>> 8) & 255,
  data.length & 255,
  ...ascii(name),
  ...data,
  0,
  0,
  0,
  0,
];

const png = (animated: boolean): ArrayBuffer =>
  bytes(
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk('IHDR', Array(13).fill(0)),
    ...(animated ? chunk('acTL', [0, 0, 0, 2, 0, 0, 0, 0]) : []),
    ...chunk('IDAT', []),
  );

const webp = (animated: boolean): ArrayBuffer => {
  const chunks = [...ascii('VP8X'), 10, 0, 0, 0, animated ? 2 : 0, ...Array(9).fill(0)];
  const size = 4 + chunks.length;

  return bytes(...ascii('RIFF'), size & 255, (size >>> 8) & 255, 0, 0, ...ascii('WEBP'), ...chunks);
};

describe('animated image signatures', () => {
  test('detects multiple GIF frames, not single-frame GIF', () => {
    expect(animatedImageMime(gif(2))).toBe('image/gif');
    expect(animatedImageMime(gif(1))).toBeNull();
  });

  test('detects APNG via an acTL chunk before IDAT', () => {
    expect(animatedImageMime(png(true))).toBe('image/png');
    expect(animatedImageMime(png(false))).toBeNull();
  });

  test('detects the WebP animation bit without relying on the filename', () => {
    expect(animatedImageMime(webp(true))).toBe('image/webp');
    expect(animatedImageMime(webp(false))).toBeNull();
  });

  test('rejects empty, truncated and invalid file headers', () => {
    expect(animatedImageMime(bytes())).toBeNull();
    expect(animatedImageMime(bytes(0x47, 0x49, 0x46, 0x38))).toBeNull();
    expect(animatedImageMime(bytes(0x89, 0x50, 0x4e, 0x47))).toBeNull();
    expect(animatedImageMime(bytes(...ascii('RIFF'), 12, 0, 0, 0, ...ascii('WEBP')))).toBeNull();
  });
});
