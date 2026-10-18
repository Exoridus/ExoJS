/**
 * The externally encoded native KTX2 corpus, read back through the real parser.
 *
 * `test/fixtures/color-external/` holds containers whose block payloads were
 * produced by the Khronos `ktx` tool (Basis Universal transcoder for BC7 and
 * ETC2, astcenc for ASTC), not by this repository. What that adds over the
 * hand-built fixtures: the container, descriptor and payload come from an
 * independent implementation, so the parser is exercised on bytes it did not
 * help write. The browser suites decode the same files on a GPU.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { parseKtx2 } from '#assets/factories/ktx2';

import { externalCorpusFormats } from './ktx2-external-formats';

const FIXTURE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/color-external');

interface ExternalFixture {
  readonly file: string;
  readonly vkFormat: number;
  readonly vkFormatName: string;
  readonly transfer: 'srgb' | 'linear';
  readonly alpha: boolean;
  readonly width: number;
  readonly height: number;
  readonly commands: readonly string[];
  readonly sha256: string;
  readonly samples: ReadonlyArray<{ readonly x: number; readonly y: number; readonly rgba: readonly number[] }>;
}

interface ExternalManifest {
  readonly tool: { readonly name: string; readonly version: string };
  readonly source: { readonly file: string; readonly sha256: string };
  readonly tolerance: number;
  readonly fixtures: readonly ExternalFixture[];
}

const manifest = JSON.parse(readFileSync(join(FIXTURE_DIR, 'manifest.json'), 'utf8')) as ExternalManifest;

const sha256 = (file: string): string =>
  createHash('sha256')
    .update(readFileSync(join(FIXTURE_DIR, file)))
    .digest('hex');

const readFixture = (file: string): ArrayBuffer => {
  const bytes = readFileSync(join(FIXTURE_DIR, file));
  const copy = new ArrayBuffer(bytes.byteLength);

  new Uint8Array(copy).set(bytes);

  return copy;
};

describe('externally encoded native KTX2 corpus', () => {
  test('records the tool, its version and the source image', () => {
    expect(manifest.tool.name).toBe('KTX-Software ktx');
    expect(manifest.tool.version).toMatch(/^ktx version: v\d+\.\d+\.\d+$/);
    expect(sha256(manifest.source.file)).toBe(manifest.source.sha256);
  });

  test('covers BC7, ETC2 RGB, ETC2 RGBA and ASTC 4x4 in both transfers', () => {
    expect(manifest.fixtures.map(entry => entry.vkFormat).sort((a, b) => a - b)).toEqual([145, 146, 147, 148, 151, 152, 157, 158]);
  });

  test.each(manifest.fixtures.map(entry => [entry.file, entry] as const))(
    '%s matches its recorded SHA-256 and lists the commands that made it',
    (_file, entry) => {
      expect(sha256(entry.file)).toBe(entry.sha256);
      expect(entry.commands.length).toBeGreaterThan(0);
    },
  );

  test.each(manifest.fixtures.map(entry => [entry.file, entry] as const))(
    '%s parses to its own format, transfer and extent',
    (_file, entry) => {
      const payload = parseKtx2(readFixture(entry.file), entry.file);

      expect(payload.kind).toBe('compressed');

      if (payload.kind !== 'compressed') {
        return;
      }

      expect(payload.format).toBe(externalCorpusFormats[entry.vkFormat]);
      expect(payload.colorSpace).toBe(entry.transfer === 'srgb' ? 'srgb' : 'linear-srgb');
      expect(payload.alphaMode).toBe('straight');
      expect(payload.levels).toHaveLength(1);
      expect(payload.levels[0]?.width).toBe(entry.width);
      expect(payload.levels[0]?.height).toBe(entry.height);
      // Whole 4x4 blocks: 16 of them, 8 bytes each for ETC2 RGB, 16 for everything else.
      expect(payload.levels[0]?.data.byteLength).toBe(16 * (entry.vkFormat === 147 || entry.vkFormat === 148 ? 8 : 16));
    },
  );

  test('a transfer pair carries different descriptors over the same block bytes for the transcoded formats', () => {
    for (const [linear, srgb] of [
      ['bc7-unorm.ktx2', 'bc7-srgb.ktx2'],
      ['etc2-rgb8-unorm.ktx2', 'etc2-rgb8-srgb.ktx2'],
      ['etc2-rgba8-unorm.ktx2', 'etc2-rgba8-srgb.ktx2'],
    ] as const) {
      const a = parseKtx2(readFixture(linear), linear);
      const b = parseKtx2(readFixture(srgb), srgb);

      if (a.kind !== 'compressed' || b.kind !== 'compressed') {
        throw new Error('expected compressed payloads');
      }

      expect(a.levels[0]?.data, `${linear} vs ${srgb}`).toEqual(b.levels[0]?.data);
      expect(a.colorSpace).not.toBe(b.colorSpace);
    }
  });
});
