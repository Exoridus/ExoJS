/**
 * Deterministic cost accounting of the colour-managed pipeline: how many draws
 * and passes a frame issues, how many bytes it uploads, and that colour
 * normalization is paid once when a texture is uploaded rather than again on
 * every draw that samples it. Every number is a count or a byte total decided
 * on the CPU side, so the assertions are exact and machine independent; no
 * timing is measured here.
 *
 * The normalization pass is observable as a GL draw the engine did not book in
 * `RenderStats.drawCalls`: the recorder sees every `drawArrays`/`drawElements`,
 * the stats see only the renderers' own submissions.
 */
import { afterEach, describe, expect, test } from 'vitest';

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { ColorMatrixFilter } from '#rendering/filters/ColorMatrixFilter';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { buildSpriteScene } from '../perf/rendering/fixtures';
import { createWebGl2Harness, measureFrame, type WebGl2Harness } from '../perf/rendering/harness';
import { createMockBackend, createMockWebGpuEnvironment, type MockWebGpuEnvironment } from './webgpuMockEnvironment';

const TEXTURE_SIZE = 32;
const RGBA8_BYTES = 4;
const TEXTURE_BYTES = TEXTURE_SIZE * TEXTURE_SIZE * RGBA8_BYTES;

const payload = (alpha: number) => {
  const data = new Uint8Array(TEXTURE_BYTES);

  for (let offset = 0; offset < data.length; offset += RGBA8_BYTES) {
    data[offset] = 220;
    data[offset + 1] = 120;
    data[offset + 2] = 40;
    data[offset + 3] = alpha;
  }

  return { colorSpace: 'srgb', alphaMode: 'straight', levels: [{ data, width: TEXTURE_SIZE, height: TEXTURE_SIZE }] } as const;
};

const translucentTexture = (): Texture => Texture.fromPixels(payload(128), { generateMipMap: false });

interface Cost {
  /** GL draws the normalization pass issued: everything the recorder saw beyond the engine's own draws. */
  readonly normalizationDraws: number;
  readonly engineDraws: number;
  readonly renderPasses: number;
  readonly textureUploadBytes: number;
}

/** Enough frames for every lazily grown store to reach its steady size. */
const settle = (harness: WebGl2Harness, root: Container): void => {
  for (let frame = 0; frame < 6; frame++) {
    measureFrame(harness, root);
  }
};

const measureCost = (harness: WebGl2Harness, root: Container): Cost => {
  const metrics = measureFrame(harness, root);

  return {
    normalizationDraws: harness.recorder.drawCalls - metrics.drawCalls,
    engineDraws: metrics.drawCalls,
    renderPasses: metrics.renderPasses,
    textureUploadBytes: harness.backend.stats.textureUploadBytes,
  };
};

/** What realizing one texture on the device costs, in isolation from any scene. */
const measureUpload = (harness: WebGl2Harness, texture: Texture): Pick<Cost, 'normalizationDraws' | 'textureUploadBytes'> => {
  harness.backend.resetStats();
  harness.recorder.reset();
  harness.backend.bindTexture(texture, 0);

  return { normalizationDraws: harness.recorder.drawCalls, textureUploadBytes: harness.backend.stats.textureUploadBytes };
};

describe('colour-managed frame cost', () => {
  let harness: WebGl2Harness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  test('a translucent texture costs one normalization draw and its own bytes on upload', () => {
    harness = createWebGl2Harness();

    const texture = translucentTexture();

    expect(measureUpload(harness, texture)).toEqual({ normalizationDraws: 1, textureUploadBytes: TEXTURE_BYTES });
    // Binding again is a cache hit: nothing is uploaded or normalized.
    expect(measureUpload(harness, texture)).toEqual({ normalizationDraws: 0, textureUploadBytes: 0 });

    texture.destroy();
  });

  test('once uploaded, a texture is never normalized or uploaded again by later frames', () => {
    harness = createWebGl2Harness();

    const texture = translucentTexture();
    const { root } = buildSpriteScene({ count: 64, textures: [texture] });

    expect(measureCost(harness, root).normalizationDraws).toBe(1);

    settle(harness, root);

    for (let frame = 0; frame < 5; frame++) {
      const cost = measureCost(harness, root);

      expect(cost.normalizationDraws).toBe(0);
      expect(cost.textureUploadBytes).toBe(0);
    }

    root.destroy();
    texture.destroy();
  });

  test('normalization cost follows the number of uploaded textures, not the number of draws sampling them', () => {
    const costs: number[] = [];

    for (const count of [1, 16, 256]) {
      harness = createWebGl2Harness();

      const texture = translucentTexture();
      const { root } = buildSpriteScene({ count, textures: [texture] });

      costs.push(measureCost(harness, root).normalizationDraws);

      root.destroy();
      texture.destroy();
      harness.destroy();
      harness = null;
    }

    expect(costs).toEqual([1, 1, 1]);
  });

  test('each distinct translucent texture adds exactly one normalization draw', () => {
    harness = createWebGl2Harness();

    const textures = [translucentTexture(), translucentTexture(), translucentTexture()];
    const { root } = buildSpriteScene({ count: 30, textures });

    expect(measureCost(harness, root).normalizationDraws).toBe(textures.length);

    settle(harness, root);

    expect(measureCost(harness, root).normalizationDraws).toBe(0);

    root.destroy();
    textures.forEach(texture => texture.destroy());
  });

  test('an opaque texture and a texture that opts out of premultiplication skip the pass entirely', () => {
    harness = createWebGl2Harness();

    const opaque = Texture.fromPixels(payload(255), { generateMipMap: false });
    const straight = Texture.fromPixels(payload(128), { generateMipMap: false, premultiplyAlpha: false });
    const expected = { normalizationDraws: 0, textureUploadBytes: TEXTURE_BYTES };

    expect(measureUpload(harness, opaque)).toEqual(expected);
    expect(measureUpload(harness, straight)).toEqual(expected);

    opaque.destroy();
    straight.destroy();
  });

  test('replacing a texture payload pays normalization again for that texture alone', () => {
    harness = createWebGl2Harness();

    const changing = translucentTexture();
    const stable = translucentTexture();
    const { root } = buildSpriteScene({ count: 16, textures: [changing, stable] });

    settle(harness, root);
    changing.setPixels(payload(64));

    const updated = measureCost(harness, root);

    expect(updated.normalizationDraws).toBe(1);
    expect(updated.textureUploadBytes).toBeGreaterThanOrEqual(TEXTURE_BYTES);

    settle(harness, root);

    expect(measureCost(harness, root).normalizationDraws).toBe(0);

    root.destroy();
    changing.destroy();
    stable.destroy();
  });

  test('changing a tint recolours sprites without normalizing or re-uploading any content texture', () => {
    harness = createWebGl2Harness();

    const texture = translucentTexture();
    const { root, sprites } = buildSpriteScene({ count: 32, textures: [texture] });

    settle(harness, root);

    sprites.forEach((sprite, index) => {
      sprite.setTint(new Color(index * 8, 255 - index * 8, 128, 0.5));
    });

    const recoloured = measureCost(harness, root);

    expect(recoloured.normalizationDraws).toBe(0);
    expect(recoloured.textureUploadBytes).toBeLessThan(TEXTURE_BYTES);

    root.destroy();
    texture.destroy();
  });

  test('a steady frame issues the same draws, passes and uploads every time', () => {
    harness = createWebGl2Harness();

    const texture = translucentTexture();
    const { root } = buildSpriteScene({ count: 128, textures: [texture] });

    settle(harness, root);

    const frames = Array.from({ length: 4 }, () => measureCost(harness!, root));

    for (const frame of frames) {
      expect(frame).toEqual(frames[0]);
    }

    // One texture, one blend mode: the whole layer is a single instanced draw.
    expect(frames[0]).toEqual({ normalizationDraws: 0, engineDraws: 1, renderPasses: 0, textureUploadBytes: 0 });

    root.destroy();
    texture.destroy();
  });

  test('a filtered sprite adds intermediate passes but no steady-state content uploads or normalization', () => {
    harness = createWebGl2Harness();

    const texture = translucentTexture();
    const plain = new Sprite(texture);
    const filtered = new Sprite(texture);
    const root = new Container();

    filtered.addFilter(new ColorMatrixFilter());
    filtered.setPosition(100, 100);
    root.addChild(plain, filtered);

    settle(harness, root);

    const frames = Array.from({ length: 3 }, () => measureCost(harness!, root));

    for (const frame of frames) {
      expect(frame).toEqual(frames[0]);
      expect(frame.normalizationDraws).toBe(0);
      // The filter quad's own instance data is re-sent every frame; no content texture is.
      expect(frame.textureUploadBytes).toBeLessThan(TEXTURE_BYTES);
    }

    expect(frames[0]!.renderPasses).toBeGreaterThan(0);

    root.destroy();
    texture.destroy();
  });
});

describe('colour-managed upload cost on WebGPU', () => {
  const NORMALIZE_PASS = 'backend:color-normalize-pass';
  let environment: MockWebGpuEnvironment | null = null;
  let backend: WebGpuBackend | null = null;

  afterEach(() => {
    backend?.destroy();
    environment?.restore();
    backend = null;
    environment = null;
  });

  const normalizePasses = (): number => environment!.renderPassLabels().filter(label => label === NORMALIZE_PASS).length;

  test('normalization runs once per translucent texture upload and never on later binds', async () => {
    environment = createMockWebGpuEnvironment();
    backend = await createMockBackend(environment);

    const texture = translucentTexture();

    backend.resetStats();
    backend.getTextureBinding(texture);

    expect(normalizePasses()).toBe(1);
    expect(backend.stats.textureUploadBytes).toBe(TEXTURE_BYTES);

    backend.resetStats();

    for (let bind = 0; bind < 5; bind++) {
      backend.getTextureBinding(texture);
    }

    expect(normalizePasses()).toBe(1);
    expect(backend.stats.textureUploadBytes).toBe(0);

    texture.destroy();
  });

  test('an opaque texture is uploaded without a normalization pass', async () => {
    environment = createMockWebGpuEnvironment();
    backend = await createMockBackend(environment);

    const texture = Texture.fromPixels(payload(255), { generateMipMap: false });

    backend.getTextureBinding(texture);

    expect(normalizePasses()).toBe(0);

    texture.destroy();
  });
});
