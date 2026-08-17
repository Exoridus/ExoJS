/**
 * Shared fixture for the RGB-1D LUT pixel specs (WebGL2 + WebGPU).
 *
 * A 1D LUT grades each channel through its OWN curve:
 *
 *   R' = lut(src.r).r   G' = lut(src.g).g   B' = lut(src.b).b   A' = src.a
 *
 * The probe LUT below therefore gives the three channels three visibly
 * different curves, so a shader that reads the whole RGB of one lookup — the
 * defect this fixture exists to catch — cannot produce the expected pixels for
 * any input that is not already grey.
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { LutFilter } from '#rendering/filters/LutFilter';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';

import type { RgbaTuple } from './_pixels';

export const LUT_SCENE_SIZE = 64;

/** Where the sprite sits, and a point safely inside it. */
export const SPRITE_ORIGIN = 16;
export const SAMPLE_POINT = 24;

const LUT_SIZE = 256;

const context2d = (canvas: HTMLCanvasElement): CanvasRenderingContext2D => {
  const context = canvas.getContext('2d');

  if (context === null) throw new Error('A 2D context is required to build LUT fixtures.');

  return context;
};

/** A `width×height` texture of one flat colour. */
export const solidTexture = (color: string, width = 16, height = 16): Texture => {
  const source = document.createElement('canvas');

  source.width = width;
  source.height = height;

  const context = context2d(source);

  context.fillStyle = color;
  context.fillRect(0, 0, width, height);

  return new Texture(source);
};

/**
 * The probe LUT: red inverted, green halved, blue pinned to full.
 *
 * Every channel is a different function of its own input, and none of them is
 * the identity, so the expected output for a primary-coloured input differs
 * from what a red-indexed lookup of the same LUT would return.
 */
export const probeLut = (): Texture => {
  const canvas = document.createElement('canvas');

  canvas.width = LUT_SIZE;
  canvas.height = 1;

  const context = context2d(canvas);
  const image = context.createImageData(LUT_SIZE, 1);

  for (let i = 0; i < LUT_SIZE; i++) {
    const offset = i * 4;

    image.data[offset] = 255 - i;
    image.data[offset + 1] = Math.round(i / 2);
    image.data[offset + 2] = 255;
    image.data[offset + 3] = 255;
  }

  context.putImageData(image, 0, 0);

  return LutFilter.fromImage(canvas);
};

/** `probeLut()` applied to one 0–255 channel triple, on the CPU. */
export const expectedProbeOutput = (r: number, g: number, b: number): RgbaTuple => [255 - r, Math.round(g / 2), 255, 255];

/** A sprite of `color`, filtered by `filter`, parented under a fresh root. */
export const lutScene = (color: string, filter: LutFilter): { root: Container; texture: Texture } => {
  const texture = solidTexture(color);
  const root = new Container();
  const filtered = new Container();
  const sprite = new Sprite(texture);

  sprite.setPosition(SPRITE_ORIGIN, SPRITE_ORIGIN);
  filtered.addFilter(filter);
  filtered.addChild(sprite);
  root.addChild(filtered);

  return { root, texture };
};

/** The primaries and a mixed colour, as CSS strings plus their 0–255 triples. */
export const PROBE_COLOURS = [
  { css: '#ff0000', rgb: [255, 0, 0] },
  { css: '#00ff00', rgb: [0, 255, 0] },
  { css: '#0000ff', rgb: [0, 0, 255] },
  { css: '#40a0c0', rgb: [0x40, 0xa0, 0xc0] },
] as const;

/** Black clear colour, so an unrendered sprite reads as `[0, 0, 0, 255]`. */
export const CLEAR = Color.black;
