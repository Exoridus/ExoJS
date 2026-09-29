/**
 * The committed colour fixtures, read back through the real parser.
 *
 * What this adds over a suite that synthesizes its own containers: the expected
 * level byte lengths come from `test/fixtures/color/manifest.json`, which
 * `scripts/generate-color-fixtures.ts` derived from the KTX 2.0 container layout
 * without importing anything from `src/`. A wrong entry in the engine's own
 * block-size table therefore fails here rather than agreeing with itself.
 *
 * The manifest is authoritative for identity: every file is checked against its
 * recorded SHA-256, so a hand-edited or regenerated fixture cannot pass unnoticed.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { inflateKtx2Levels, parseKtx2 } from '#assets/factories/ktx2';

const FIXTURE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/color');

interface ManifestLevel {
  readonly level: number;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
}

interface ManifestEntry {
  readonly file: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly vkFormat: number;
  readonly width: number;
  readonly height: number;
  readonly supercompression: number;
  readonly transferFunction: number;
  readonly alphaFlags: number;
  readonly levels: readonly ManifestLevel[];
  readonly provenance: string;
  readonly note: string;
}

interface Manifest {
  readonly generator: string;
  readonly scope: string;
  readonly fixtures: readonly ManifestEntry[];
}

const manifest = JSON.parse(readFileSync(join(FIXTURE_DIR, 'manifest.json'), 'utf8')) as Manifest;

const readFixture = (file: string): ArrayBuffer => {
  const bytes = readFileSync(join(FIXTURE_DIR, file));
  const copy = new ArrayBuffer(bytes.byteLength);

  new Uint8Array(copy).set(bytes);

  return copy;
};

const findFixture = (file: string): ManifestEntry => {
  const entry = manifest.fixtures.find(candidate => candidate.file === file);

  if (entry === undefined) {
    throw new Error(`manifest.json does not list ${file}. Run scripts/generate-color-fixtures.ts.`);
  }

  return entry;
};

/** The sRGB code for a linear value, from the spec formula rather than the engine's. */
const encodeSrgb = (linear: number): number => Math.round(255 * (linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055));

describe('colour fixture manifest', () => {
  test('every listed fixture is present and byte-identical to its recorded hash', () => {
    expect(manifest.fixtures.length).toBeGreaterThan(0);

    for (const entry of manifest.fixtures) {
      const bytes = new Uint8Array(readFixture(entry.file));

      expect(bytes.byteLength, `${entry.file} byte length`).toBe(entry.byteLength);
      expect(createHash('sha256').update(bytes).digest('hex'), `${entry.file} sha256`).toBe(entry.sha256);
    }
  });

  test('records how the fixtures were produced, and what they do not cover', () => {
    expect(manifest.generator).toBe('scripts/generate-color-fixtures.ts');

    for (const entry of manifest.fixtures) {
      expect(entry.provenance).toContain('scripts/generate-color-fixtures.ts');
      expect(entry.note.length).toBeGreaterThan(0);
    }

    // The scope statement is part of the evidence: a reader must not be able to
    // mistake these for a qualified compressed-format matrix.
    expect(manifest.scope).toMatch(/Uncompressed RGBA8 only/);
  });

  test('records level sizes derived independently of the engine table', () => {
    for (const entry of manifest.fixtures) {
      for (const level of entry.levels) {
        if (entry.supercompression === 3) {
          continue;
        }

        // RGBA8: four bytes per texel, straight from the container layout.
        expect(level.byteLength, `${entry.file} level ${level.level}`).toBe(level.width * level.height * 4);
      }
    }
  });
});

describe('committed KTX2 colour fixtures', () => {
  test('reads the linear and sRGB members of one pair as distinct storage', () => {
    const linear = parseKtx2(readFixture('rgba8-linear.ktx2'), 'rgba8-linear.ktx2');
    const srgb = parseKtx2(readFixture('rgba8-srgb.ktx2'), 'rgba8-srgb.ktx2');

    // The pair exists to prove transfer is CARRIED, not assumed: identical pixels,
    // different vkFormat, different resolved interpretation.
    expect(linear).toMatchObject({ kind: 'rgba8', colorSpace: 'linear-srgb', alphaMode: 'straight' });
    expect(srgb).toMatchObject({ kind: 'rgba8', colorSpace: 'srgb', alphaMode: 'straight' });

    if (linear.kind !== 'rgba8' || srgb.kind !== 'rgba8') return;

    expect(srgb.levels[0]?.data).toEqual(linear.levels[0]?.data);
  });

  test('preserves every supplied RGBA8 mip byte and its extent', () => {
    const entry = findFixture('rgba8-mips-srgb.ktx2');
    const payload = parseKtx2(readFixture(entry.file), entry.file);

    expect(payload.kind).toBe('rgba8');

    if (payload.kind !== 'rgba8') return;

    expect(payload.levels).toHaveLength(entry.levels.length);

    for (const [index, level] of payload.levels.entries()) {
      const expected = entry.levels[index]!;

      expect(level.width, `level ${index} width`).toBe(expected.width);
      expect(level.height, `level ${index} height`).toBe(expected.height);
      expect(level.data.byteLength, `level ${index} bytes`).toBe(expected.byteLength);
      // Every level of this fixture is opaque, so the alpha channel is a constant
      // and the RGB ramp has to match the generator's own progression.
      expect(new Set(Array.from(level.data.filter((_texel, offset) => offset % 4 === 3)))).toEqual(new Set([255]));
    }

    // A chain that arrived smallest-first or reordered would show up as a
    // descending extent list; a dropped level as a shorter one.
    expect(payload.levels.map(({ width, height }) => [width, height])).toEqual([
      [8, 8],
      [4, 4],
      [2, 2],
      [1, 1],
    ]);
  });

  test('inflates a ZLIB fixture to exactly the pixels of its uncompressed twin', async () => {
    const compressed = findFixture('rgba8-zlib.ktx2');
    const reference = findFixture('rgba8-srgb.ktx2');
    const inflated = await inflateKtx2Levels(readFixture(compressed.file), compressed.file);
    const plain = parseKtx2(readFixture(reference.file), reference.file);

    // The inflated buffer is a whole new container, so it parses in its turn.
    const inflatedPayload = parseKtx2(inflated, `${compressed.file} (inflated)`);

    expect(inflatedPayload.kind).toBe('rgba8');
    expect(plain.kind).toBe('rgba8');

    if (inflatedPayload.kind !== 'rgba8' || plain.kind !== 'rgba8') return;

    expect(inflatedPayload.colorSpace).toBe(plain.colorSpace);
    expect(inflatedPayload.levels[0]?.data).toEqual(plain.levels[0]?.data);
    // The compressed file is genuinely smaller, so the fixture is really deflated
    // rather than stored with a scheme byte bolted on.
    expect(compressed.byteLength).toBeLessThan(reference.byteLength);
  });

  test('keeps a straight and a premultiplied authoring of one image apart', () => {
    const straight = parseKtx2(readFixture('alpha-straight-srgb.ktx2'), 'alpha-straight-srgb.ktx2');
    const premultiplied = parseKtx2(readFixture('alpha-pma-srgb.ktx2'), 'alpha-pma-srgb.ktx2');

    expect(straight).toMatchObject({ kind: 'rgba8', alphaMode: 'straight' });
    expect(premultiplied).toMatchObject({ kind: 'rgba8', alphaMode: 'premultiplied' });

    if (straight.kind !== 'rgba8' || premultiplied.kind !== 'rgba8') return;

    // The premultiplied authoring definition is E(linearRGB * alpha), NOT
    // E(rgb) * alpha. The sRGB transfer is concave with E(0) = 0, so for a
    // fractional alpha the two products differ and the correct one is BRIGHTER:
    // this is a checkable consequence, not a stylistic preference.
    const straightData = straight.levels[0]!.data;
    const premultipliedData = premultiplied.levels[0]!.data;
    // Texel (5, 0): the first fractional alpha of the ramp, opaque neighbours on
    // either side, so a mis-sliced level cannot produce these values.
    const texel = 5 * 4;
    const alpha = straightData[texel + 3]! / 255;

    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(1);
    expect(premultipliedData[texel + 3]).toBe(straightData[texel + 3]);
    expect(premultipliedData[texel]).toBe(encodeSrgb((straightData[texel]! / 255) * alpha));
    expect(premultipliedData[texel]).toBeGreaterThan(Math.round(straightData[texel]! * alpha));

    // The fully transparent texel of the same row carries no colour at all, and
    // its hidden colour never survives: this is the fringe the profile exists to
    // keep out of a filtered result.
    const transparent = 4 * 4;

    expect(straightData[transparent + 3]).toBe(0);
    expect(premultipliedData[transparent]).toBe(0);
  });

  test('reads premultiplied alpha from the registry flag bit', () => {
    const entry = findFixture('alpha-pma-srgb.ktx2');
    const buffer = readFixture(entry.file);
    const bytes = new Uint8Array(buffer);
    const dfdOffset = new DataView(buffer).getUint32(48, true);

    // KHR_DF_FLAG_ALPHA_PREMULTIPLIED is bit 0 of the DFD flags byte - value 1 -
    // and the KTX descriptor requires the byte to be 0 otherwise. Every tool
    // that follows the KHR data format registry writes the flag there, so a
    // parser reading any other value silently reports straight alpha for a
    // premultiplied image. Pinning the registry value is what stops that.
    expect(entry.alphaFlags).toBe(1);
    expect(bytes[dfdOffset + 15]).toBe(1);
    expect(parseKtx2(buffer, entry.file)).toMatchObject({ alphaMode: 'premultiplied' });
  });

  test('rejects a DFD flags byte outside the two the descriptor defines', () => {
    const entry = findFixture('alpha-pma-srgb.ktx2');

    // Bit 1 is a separate registry flag, not a second spelling of
    // premultiplied. Reading it as premultiplied would make the association
    // depend on an encoding no conforming writer emits.
    const mutated = readFixture(entry.file);

    new Uint8Array(mutated)[new DataView(mutated).getUint32(48, true) + 15] = 2;

    expect(() => parseKtx2(mutated, entry.file)).toThrow(/alpha/i);
  });

  test('rejects a fixture whose DFD was edited into a contradiction', () => {
    const entry = findFixture('rgba8-srgb.ktx2');
    const buffer = readFixture(entry.file);
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    const dfdOffset = view.getUint32(48, true);

    // sRGB vkFormat with a linear DFD transfer is a contradiction, and the engine
    // must reject it rather than pick a winner.
    bytes[dfdOffset + 14] = 1;

    expect(() => parseKtx2(buffer, entry.file)).toThrow();
  });
});
