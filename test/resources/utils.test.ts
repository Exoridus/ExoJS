import { determineMimeType } from '#resources/utils';

/** Builds a big-endian uint32 as 4 bytes. */
function u32be(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function toBuffer(bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

describe('determineMimeType', () => {
  test('throws when the buffer is empty', () => {
    expect(() => determineMimeType(new ArrayBuffer(0))).toThrow('Cannot determine mime type: No data.');
  });

  test('detects PNG by its magic bytes', () => {
    const png = toBuffer([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

    expect(determineMimeType(png)).toBe('image/png');
  });

  test('falls back to text/plain for unrecognized bytes', () => {
    const unknown = toBuffer([0x01, 0x02, 0x03, 0x04, 0x05]);

    expect(determineMimeType(unknown)).toBe('text/plain');
  });

  describe('MP4 detection (matchesMp4Video)', () => {
    test('detects a valid MP4 box (correct box size, "ftypmp4" brand)', () => {
      // 20-byte box: [box size u32][ 'ftypmp4' ][ padding ] — header.length === boxSize (20),
      // which satisfies `header.length >= max(12, boxSize)` and `boxSize % 4 === 0`.
      const bytes = [...u32be(20), 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0, 0, 0, 0, 0, 0, 0, 0, 0];

      expect(bytes).toHaveLength(20);
      expect(determineMimeType(toBuffer(bytes))).toBe('video/mp4');
    });

    test('does not match when the box size does not fit the buffer', () => {
      // Declared box size (999) is far larger than the actual buffer.
      const bytes = [...u32be(999), 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0, 0, 0, 0];

      expect(determineMimeType(toBuffer(bytes))).toBe('text/plain');
    });

    test('does not match when the box size is not a multiple of 4', () => {
      // header.length === boxSize (21) satisfies the size check, but 21 % 4 !== 0.
      const bytes = [...u32be(21), 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

      expect(bytes).toHaveLength(21);
      expect(determineMimeType(toBuffer(bytes))).toBe('text/plain');
    });
  });

  describe('WebM detection (matchesWebmVideo)', () => {
    test('detects a valid WebM/Matroska EBML header with a "webm" DocType', () => {
      // EBML magic, then DocType element id (0x42 0x82), a size byte, then "webm".
      const bytes = [0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d];

      expect(determineMimeType(toBuffer(bytes))).toBe('video/webm');
    });

    test('does not match when the EBML magic is present but no DocType id is found', () => {
      const bytes = [0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0];

      expect(determineMimeType(toBuffer(bytes))).toBe('text/plain');
    });
  });

  describe('AVIF detection (matchesAvifImage)', () => {
    test('detects a valid AVIF ("ftyp" + "avif" brand, at least 12 bytes)', () => {
      const bytes = [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66];

      expect(determineMimeType(toBuffer(bytes))).toBe('image/avif');
    });

    test('detects a valid AVIS (image sequence) via the "avis" brand', () => {
      const bytes = [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x73];

      expect(determineMimeType(toBuffer(bytes))).toBe('image/avif');
    });

    test('does not match when the buffer is at least 12 bytes but lacks a "ftyp" box', () => {
      const bytes = [0, 1, 2, 3, 0x66, 0, 0, 0, 0, 0, 0, 0];

      expect(determineMimeType(toBuffer(bytes))).toBe('text/plain');
    });

    test('does not match (falls through) when brand is neither "avif" nor "avis"', () => {
      const bytes = [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31]; // 'ftyp' + 'mif1' (HEIC)

      expect(determineMimeType(toBuffer(bytes))).toBe('text/plain');
    });
  });
});
