import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { parseKtx2Descriptor } from '#assets/factories/ktx2Descriptor';

const fixture = (name: string): ArrayBuffer => Uint8Array.from(readFileSync(`test/fixtures/basis/${name}.ktx2`)).buffer;

describe('Basis KTX2 descriptors', () => {
  test('committed codec fixtures match their source manifest', () => {
    const manifest = JSON.parse(readFileSync('test/fixtures/basis/manifest.json', 'utf8')) as {
      fixtures: Array<{ file: string; sha256: string }>;
    };

    for (const entry of manifest.fixtures) {
      const bytes = readFileSync(`test/fixtures/basis/${entry.file}`);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
    }
  });
  test.each(['etc1s', 'uastc'])('%s validates real RGB and RGBA mip chains', mode => {
    for (const alpha of ['opaque', 'alpha']) {
      for (const color of ['linear', 'srgb']) {
        const descriptor = parseKtx2Descriptor(fixture(`${mode}-${alpha}-${color}`), 'basis.ktx2');
        expect(descriptor.universal).toBe(mode);
        expect(descriptor.dfd.hasAlpha).toBe(alpha === 'alpha');
        expect(descriptor.dfd.transferFunction).toBe(color === 'srgb' ? 2 : 1);
        expect([descriptor.pixelWidth, descriptor.pixelHeight, descriptor.levelCount]).toEqual([28, 12, 5]);
      }
    }
  });

  test('UASTC Zstd is classified separately from native Zstd', () => {
    const descriptor = parseKtx2Descriptor(fixture('uastc-alpha-srgb-zstd'), 'zstd.ktx2');
    expect(descriptor.universal).toBe('uastc');
    expect(descriptor.supercompressionScheme).toBe(2);
  });

  test.each([
    ['scheme', (v: DataView) => v.setUint32(44, 0, true)],
    [
      'SGD',
      (v: DataView) => {
        v.setUint32(64, 0, true);
        v.setUint32(72, 0, true);
      },
    ],
    ['mips', (v: DataView) => v.setUint32(40, 0, true)],
    ['transfer', (v: DataView) => v.setUint8(v.getUint32(48, true) + 14, 4)],
    ['channels', (v: DataView) => v.setUint8(v.getUint32(48, true) + 31, 3)],
  ])('rejects malformed ETC1S %s before WASM', (_name, mutate) => {
    const buffer = fixture('etc1s-alpha-srgb');
    mutate(new DataView(buffer));
    expect(() => parseKtx2Descriptor(buffer, 'malformed.ktx2')).toThrow();
  });

  test('UASTC rejects inconsistent decoded sizes', () => {
    const buffer = fixture('uastc-alpha-srgb-zstd');
    new DataView(buffer).setUint32(96, 1, true);
    expect(() => parseKtx2Descriptor(buffer, 'bad-size.ktx2')).toThrow(/byte length/);
  });
});
