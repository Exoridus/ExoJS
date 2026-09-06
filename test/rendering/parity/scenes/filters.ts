/**
 * Scenes for the stock filters that declare a typed uniform schema.
 *
 * Their uniforms no longer reach the GPU through a hand-written WGSL struct on
 * one side and named GLSL uniforms on the other; both languages now describe
 * one generated block. That makes the two backends' agreement worth something
 * it was not before: WebGL2 lets the driver lay the block out under `std140`
 * while WebGPU follows the generated `@align`/`@size` attributes, so a field
 * placed at the wrong offset moves the picture on exactly one of them.
 *
 * The colour matrix exercises an array of `vec4` followed by a `vec4`; the drop
 * shadow a `vec2` followed by a `vec4`, where the eight bytes of padding std140
 * inserts between the two is the mistake a hand-written struct makes.
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { ColorMatrixFilter } from '#rendering/filters/ColorMatrixFilter';
import { DropShadowFilter } from '#rendering/filters/DropShadowFilter';
import { Sprite } from '#rendering/sprite/Sprite';
import { DataTexture } from '#rendering/texture/DataTexture';
import { TextureFormat } from '#rendering/types';

import type { Scene } from '../types';

const CANVAS = 64;

/** The graded fill, named so the oracle reads the same values the scene drew. */
const FILL = new Color(64, 128, 192, 1);
const SHADOW = new Color(255, 0, 0, 1);

/** Bias applied to red and green by the colour-matrix scene, in 0..1. */
const RED_BIAS = 0.25;
const GREEN_BIAS = -0.25;

const square = (color: Color, x: number, y: number, size: number): Sprite => {
  const data = new Uint8Array(size * size * 4);

  for (let i = 0; i < size * size; i++) {
    data[i * 4] = color.r;
    data[i * 4 + 1] = color.g;
    data[i * 4 + 2] = color.b;
    data[i * 4 + 3] = 255;
  }

  const sprite = new Sprite(new DataTexture({ width: size, height: size, format: TextureFormat.Rgba8, data }));

  sprite.setPosition(x, y);

  return sprite;
};

const channel = (value: number, bias: number): number => Math.round(Math.min(1, Math.max(0, value / 255 + bias)) * 255);

export const filterScenes: readonly Scene[] = [
  {
    // The rows stay the identity and the whole grade comes from the bias
    // vector, which is the field sitting immediately after the array: a row
    // stride other than 16, or a bias read from the wrong offset, changes this
    // pixel and nothing else in the matrix would notice.
    name: 'filter/color-matrix-bias',
    feature: 'ColorMatrixFilter',
    size: CANVAS,
    fixture: 'opaque-solid',
    nearestSampled: false,
    build: () => {
      const root = new Container();

      root.addChild(square(FILL, 8, 8, 48));
      // Rows are [r, g, b, a, offset].
      root.filters = [new ColorMatrixFilter([1, 0, 0, 0, RED_BIAS, 0, 1, 0, 0, GREEN_BIAS, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0])];

      return root;
    },
    oracle: {
      reason: 'an identity colour matrix plus a per-channel bias, over an opaque (64, 128, 192) fill',
      // The filter grades on straight alpha, so an opaque pixel makes one round
      // trip through the render target and back.
      tolerance: 2,
      samples: () => [
        {
          x: 32,
          y: 32,
          expect: [channel(FILL.r, RED_BIAS), channel(FILL.g, GREEN_BIAS), channel(FILL.b, 0), 255] as const,
          describe: 'biased fill',
        },
      ],
    },
  },
  {
    // A hard-edged shadow: the blur is switched off so the silhouette pass is
    // the whole effect and its shift is exact. The shift is the `vec2` the
    // block places before a `vec4`, so reading it from byte 16 instead of 0
    // moves the shadow off the canvas entirely.
    name: 'filter/drop-shadow-hard-offset',
    feature: 'DropShadowFilter',
    size: CANVAS,
    fixture: 'opaque-solid',
    nearestSampled: false,
    build: () => {
      const root = new Container();

      root.addChild(square(FILL, 12, 12, 24));
      root.filters = [new DropShadowFilter({ offsetX: 10, offsetY: 10, blur: 0, color: SHADOW })];

      return root;
    },
    oracle: {
      reason: 'an unblurred silhouette flattened to opaque red and shifted by (10, 10), with the source composited over it',
      tolerance: 2,
      samples: () => [
        { x: 16, y: 16, expect: [FILL.r, FILL.g, FILL.b, 255] as const, describe: 'source above the shadow' },
        { x: 41, y: 41, expect: [SHADOW.r, SHADOW.g, SHADOW.b, 255] as const, describe: 'shadow beyond the source' },
        { x: 2, y: 2, expect: [0, 0, 0, 255] as const, describe: 'cleared background' },
      ],
    },
  },
];
