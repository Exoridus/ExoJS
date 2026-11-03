import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../..');
const tool = join(root, 'tools/pixelfx-transitions');
const output = join(root, 'examples/assets/pixelfx-transitions');
const check = process.argv.includes('--check');
assert(
  process.argv.slice(2).every(arg => arg === '--check'),
  'Usage: node scripts/pixelfx-transitions/generate.ts [--check]',
);
const temporary = mkdtempSync(join(tmpdir(), 'exojs-pixelfx-'));
const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

const emit = (file: string, data: string | Uint8Array) => {
  if (check) {
    assert.equal(sha256(readFileSync(file)), sha256(Buffer.from(data)), `${file}: regenerate committed output`);
  } else {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, data);
  }
};

const materialize = (directory = '') => {
  for (const entry of readdirSync(join(tool, 'upstream', directory), { withFileTypes: true })) {
    const relative = join(directory, entry.name);

    if (entry.isDirectory()) {
      materialize(relative);
    } else {
      assert(relative.endsWith('.txt'));
      const file = join(temporary, relative.slice(0, -4));
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, readFileSync(join(tool, 'upstream', relative)));
    }
  }
};

try {
  materialize();
  writeFileSync(join(temporary, 'package.json'), '{"type":"module"}\n');
  const { createFrame, clearFrame, createFx, composite, backdrop, painterFor } = await import(
    pathToFileURL(join(temporary, 'src/core/index.js')).href
  );
  const { encodePNG } = await import(pathToFileURL(join(temporary, 'tools/lib/png.mjs')).href);
  const width = 320;
  const height = 180;
  const fps = 30;
  const effects = [];
  const measurements = [];
  const background = backdrop('sky', width, height, 0);

  for (const [id, label] of [
    ['burn-away', 'Burn Away'],
    ['pixel-dissolve', 'Pixel Dissolve'],
    ['star-iris', 'Star Iris'],
  ]) {
    const mod = await import(pathToFileURL(join(temporary, `src/fx/transitions/${id}.js`)).href);
    assert.deepEqual(mod.meta.size, [width, height]);
    assert.equal(mod.meta.fps, fps);
    assert.equal(mod.meta.loop, false);
    const sourceFrameCount = Math.round(mod.meta.duration * fps) + 1;
    const instance = createFx(mod);
    const frame = createFrame(width, height);
    const sourceFrames = [];

    for (let k = 0; k < sourceFrameCount; k++) {
      if (k > 0) {
        instance.update(1 / fps);
      }

      clearFrame(frame);
      instance.draw(frame);
      sourceFrames.push(Buffer.from(composite(frame, new Uint8ClampedArray(width * height * 4), null)));
    }

    const hasAlpha = (rgba: Uint8Array) => rgba.some((value, i) => i % 4 === 3 && value > 0);
    const preludeFrames = Number(hasAlpha(sourceFrames[0]));
    const postludeFrames = Number(hasAlpha(sourceFrames.at(-1)!));
    const blank = Buffer.alloc(width * height * 4);
    const frames = [...(preludeFrames ? [blank] : []), ...sourceFrames, ...(postludeFrames ? [blank] : [])];
    const frameCount = frames.length;
    const columns = Math.ceil(Math.sqrt((frameCount * height) / width));
    const rows = Math.ceil(frameCount / columns);
    const atlasWidth = columns * width;
    const atlasHeight = rows * height;
    assert(atlasWidth <= 4096 && atlasHeight <= 4096);
    const atlas = Buffer.alloc(atlasWidth * atlasHeight * 4);
    const samples = [...new Set(Array.from({ length: 12 }, (_, i) => Math.round((i * (frameCount - 1)) / 11)))];
    const contactWidth = width * 4;
    const contactHeight = (height + 16) * 3;
    const contact = createFrame(contactWidth, contactHeight);
    const contactPainter = painterFor(contact);
    const coverage = [];
    const covers: number[] = [];
    const unique = new Set();
    const colors = new Set();
    let runCount = 0;

    for (let k = 0; k < frameCount; k++) {
      const rgba = frames[k];
      let nonzero = 0;
      let opaque = 0;
      let alphaSum = 0;
      let previous = -1;

      for (let i = 0; i < width * height; i++) {
        const alpha = rgba[i * 4 + 3];
        nonzero += Number(alpha > 0);
        opaque += Number(alpha === 255);
        alphaSum += alpha;
        const color = rgba.readUInt32LE(i * 4);
        colors.add(color);

        if (color !== previous) {
          runCount++;
          previous = color;
        }
      }

      coverage.push({ frame: k, nonzero, opaque, alphaSum });

      if (opaque === width * height) {
        covers.push(k);
      }

      if (k === 0 || k === frameCount - 1) {
        assert.equal(nonzero, 0, `${id}: endpoint ${k} must be transparent`);
      }

      unique.add(sha256(rgba));

      for (let y = 0; y < height; y++) {
        const destination = ((Math.floor(k / columns) * height + y) * atlasWidth + (k % columns) * width) * 4;
        rgba.copy(atlas, destination, y * width * 4, (y + 1) * width * 4);
      }

      const sample = samples.indexOf(k);

      if (sample >= 0) {
        const shown = createFrame(width, height);

        for (let i = 0; i < width * height; i++) {
          const alpha = rgba[i * 4 + 3] / 255;
          const bg = background[i];
          const r = Math.round(rgba[i * 4] * alpha + (bg & 255) * (1 - alpha));
          const g = Math.round(rgba[i * 4 + 1] * alpha + ((bg >>> 8) & 255) * (1 - alpha));
          const b = Math.round(rgba[i * 4 + 2] * alpha + ((bg >>> 16) & 255) * (1 - alpha));
          shown.color[i] = r | (g << 8) | (b << 16) | 0xff000000;
        }

        const x = (sample % 4) * width;
        const y = Math.floor(sample / 4) * (height + 16);
        contactPainter.text(`${k}  ${(k / fps).toFixed(2)}s`, x + 4, y + 2, 0xffffffff);

        for (let row = 0; row < height; row++) {
          contact.color.set(shown.color.subarray(row * width, (row + 1) * width), (y + 16 + row) * contactWidth + x);
        }
      }
    }

    assert(covers.length > 0, `${id}: no opaque cover`);
    assert(
      covers.every((k, i) => k === covers[0] + i),
      `${id}: cover must be contiguous`,
    );
    const png = encodePNG(atlasWidth, atlasHeight, atlas);
    effects.push({
      id,
      label,
      file: `${id}.png`,
      frameCount,
      columns,
      rows,
      coverStart: covers[0],
      coverEnd: covers.at(-1),
      sourceDuration: mod.meta.duration,
      sourceFrameCount,
      preludeFrames,
      postludeFrames,
    });
    measurements.push({
      id,
      upstreamDuration: mod.meta.duration,
      sourceFrameCount,
      sourceRgbaSha256: sha256(Buffer.concat(sourceFrames)),
      preludeFrames,
      postludeFrames,
      frameCount,
      firstSourceSample: 0,
      lastSourceSample: (sourceFrameCount - 1) / fps,
      playbackSeconds: frameCount / fps,
      pngBytes: png.length,
      frameRgbaBytes: width * height * 4 * frameCount,
      atlasWidth,
      atlasHeight,
      atlasRgbaBytes: atlas.length,
      sha256: sha256(png),
      uniqueFrames: unique.size,
      rgbaColors: colors.size,
      paletteIndexBytes: width * height * frameCount * (colors.size <= 256 ? 1 : 2) + colors.size * 4,
      rgbaRunLengthBytes: runCount * 8,
      coverage,
    });
    emit(join(output, `${id}.png`), png);
    emit(
      join(tool, `${id}-contact.png`),
      encodePNG(contactWidth, contactHeight, composite(contact, new Uint8ClampedArray(contactWidth * contactHeight * 4), null)),
    );
    console.log(`${id}: ${frameCount} frames, cover ${covers[0]}..${covers.at(-1)}, ${atlasWidth}x${atlasHeight}, ${png.length} PNG bytes`);
  }

  emit(
    join(output, 'manifest.json'),
    `${JSON.stringify({
      schema: 1,
      source: { repository: 'https://github.com/patch-gg/pixelfx', revision: 'a84159688af3ca37a4be05a0d422b94451b2e24e', license: 'MIT' },
      width,
      height,
      fps,
      effects,
    })}\n`,
  );
  emit(
    join(tool, 'measurements.json'),
    `${JSON.stringify({ width, height, fps, coverageUnits: 'pixel counts and sum of byte alpha; divide alphaSum by width*height*255 for mean coverage', effects: measurements }, null, 2)}\n`,
  );
} finally {
  assert.equal(dirname(temporary), resolve(tmpdir()));
  assert(temporary.startsWith(join(resolve(tmpdir()), 'exojs-pixelfx-')));
  rmSync(temporary, { recursive: true });
}
