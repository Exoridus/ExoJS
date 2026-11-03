// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const assets = resolve(root, 'examples/assets/pixelfx-transitions');
const tool = resolve(root, 'tools/pixelfx-transitions');
const manifest = JSON.parse(readFileSync(resolve(assets, 'manifest.json'), 'utf8'));
const measurements = JSON.parse(readFileSync(resolve(tool, 'measurements.json'), 'utf8'));

const decodeAtlas = (png: Buffer) => {
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  expect([...png.subarray(24, 29)]).toEqual([8, 6, 0, 0, 0]);
  const chunks = [];

  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);

    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') {
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    }

    offset += length + 12;
  }

  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  expect(raw.length).toBe((stride + 1) * height);
  const rgba = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1);
    expect(raw[row]).toBe(1);

    for (let x = 0; x < stride; x++) {
      rgba[y * stride + x] = (raw[row + 1 + x] + (x >= 4 ? rgba[y * stride + x - 4] : 0)) & 255;
    }
  }

  return { width, height, rgba };
};

describe('PixelFX transition assets', () => {
  it('retains the shared manifest schema and upstream timing', () => {
    expect(manifest.schema).toBe(1);
    expect(manifest.source).toEqual({
      repository: 'https://github.com/patch-gg/pixelfx',
      revision: 'a84159688af3ca37a4be05a0d422b94451b2e24e',
      license: 'MIT',
    });
    expect([manifest.width, manifest.height, manifest.fps]).toEqual([320, 180, 30]);
    expect(manifest.effects.map((effect: { id: string }) => effect.id)).toEqual(['burn-away', 'pixel-dissolve', 'star-iris']);
    expect(manifest.effects.map((effect: { frameCount: number }) => effect.frameCount)).toEqual([92, 67, 67]);
    expect(manifest.effects.map((effect: { sourceDuration: number }) => effect.sourceDuration)).toEqual([3, 2.2, 2.2]);
  });

  for (const effect of manifest.effects) {
    it(`${effect.id} has transparent endpoints, opaque cover frames and accurate coverage`, () => {
      expect(effect.file).toBe(`${effect.id}.png`);
      expect(effect.label).toBeTypeOf('string');

      for (const key of ['frameCount', 'columns', 'rows', 'coverStart', 'coverEnd']) {
        expect(Number.isInteger(effect[key])).toBe(true);
      }

      expect(effect.columns).toBeGreaterThan(0);
      expect(effect.rows).toBeGreaterThan(0);
      expect(effect.frameCount).toBeLessThanOrEqual(effect.columns * effect.rows);
      expect(effect.coverStart).toBeGreaterThan(0);
      expect(effect.coverStart).toBeLessThanOrEqual(effect.coverEnd);
      expect(effect.coverEnd).toBeLessThan(effect.frameCount - 1);
      const png = readFileSync(resolve(assets, effect.file));
      const atlas = decodeAtlas(png);
      expect([atlas.width, atlas.height]).toEqual([effect.columns * 320, effect.rows * 180]);
      expect(Math.max(atlas.width, atlas.height)).toBeLessThanOrEqual(4096);
      const measurement = measurements.effects.find((entry: { id: string }) => entry.id === effect.id);
      expect(measurement.pngBytes).toBe(png.length);
      expect(measurement.sha256).toBe(createHash('sha256').update(png).digest('hex'));
      expect(measurement.frameRgbaBytes).toBe(320 * 180 * 4 * effect.frameCount);
      expect(measurement.atlasRgbaBytes).toBe(atlas.rgba.length);
      expect(measurement.coverage).toHaveLength(effect.frameCount);
      const sourceHash = createHash('sha256');

      for (let k = 0; k < effect.frameCount; k++) {
        let nonzero = 0;
        let opaque = 0;
        let alphaSum = 0;

        for (let y = 0; y < 180; y++) {
          for (let x = 0; x < 320; x++) {
            const index = ((Math.floor(k / effect.columns) * 180 + y) * atlas.width + (k % effect.columns) * 320 + x) * 4;
            const alpha = atlas.rgba[index + 3];
            nonzero += Number(alpha > 0);
            opaque += Number(alpha === 255);
            alphaSum += alpha;
          }
        }

        expect(measurement.coverage[k]).toEqual({ frame: k, nonzero, opaque, alphaSum });

        if (k === 0 || k === effect.frameCount - 1) {
          expect(nonzero).toBe(0);
        }

        expect(opaque === 320 * 180).toBe(k >= effect.coverStart && k <= effect.coverEnd);

        if (k >= effect.preludeFrames && k < effect.preludeFrames + effect.sourceFrameCount) {
          for (let y = 0; y < 180; y++) {
            const offset = ((Math.floor(k / effect.columns) * 180 + y) * atlas.width + (k % effect.columns) * 320) * 4;
            sourceHash.update(atlas.rgba.subarray(offset, offset + 320 * 4));
          }
        }
      }

      const upstreamHashes: Record<string, string> = {
        'burn-away': '576ab1385999bfb105d9d9a11edff7c75b9988b4672141d7d72057e7519aaa42',
        'pixel-dissolve': '236ad64c5482b999ad68fc45ed87eb94ef8529a6aaca33766e4e4c3dee94d832',
        'star-iris': '166e4519a64bfcba37ad4af2cccdab189988a5f2a009ef30816c294a6a3dcabb',
      };
      expect(sourceHash.digest('hex')).toBe(upstreamHashes[effect.id]);
      expect(measurement.sourceRgbaSha256).toBe(upstreamHashes[effect.id]);
    });
  }

  it('regenerates byte-identical atlases, manifest, measurements and contact sheets', () => {
    expect(() =>
      execFileSync(process.execPath, ['scripts/pixelfx-transitions/generate.ts', '--check'], { cwd: root, timeout: 30000, stdio: 'pipe' }),
    ).not.toThrow();
  }, 35000);
});
