/**
 * Scenes whose output colour is *computed* from known inputs rather than
 * sampled from a texel.
 *
 * This is the one class the rest of the matrix structurally cannot verify.
 * Where a pixel traces back to the texel it came from, the expectation is
 * already renderer-independent; a blend, a colour matrix or a gradient stop has
 * no texel to trace, and comparing the two backends only shows that they agree.
 * Every scene here therefore carries an oracle: the expected pixel follows from
 * the scene's own inputs and the documented blend arithmetic, computed on the
 * CPU.
 *
 * The inputs are deliberately flat solids at exact values. A wrong colour space,
 * an unpremultiplied source or a reversed gradient moves these pixels by tens of
 * steps, so the tolerances stay small enough to be worth something.
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { ColorMatrixFilter } from '#rendering/filters/ColorMatrixFilter';
import { LinearGradient } from '#rendering/gradient/LinearGradient';
import { Graphics } from '#rendering/primitives/Graphics';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import { DataTexture } from '#rendering/texture/DataTexture';
import { BlendModes, TextureFormat } from '#rendering/types';

import type { OracleSample, Scene } from '../types';

const CANVAS = 64;

/**
 * The additive pair, named rather than taken from `Color`'s CSS table: the
 * oracle reads these same objects, so the expected sum cannot drift away from
 * what the scene actually drew.
 */
const ADDITIVE_BACKDROP = new Color(200, 40, 0, 1);
const ADDITIVE_OVERLAY = new Color(80, 160, 0, 1);

/**
 * A flat opaque square as a sprite rather than a `Graphics` fill: node alpha
 * and blend mode live on `Drawable`, and `Graphics` is a `Container`.
 */
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

const rooted = (...children: readonly RenderNode[]): Container => {
  const root = new Container();

  for (const child of children) root.addChild(child);

  return root;
};

/** The cleared canvas, sampled where nothing was drawn - the cheapest way to catch a scene that covered everything. */
const clearedAt = (x: number, y: number): OracleSample => ({ x, y, expect: [0, 0, 0, 255], describe: 'cleared background' });

export const computedColourScenes: readonly Scene[] = [
  {
    // Source-over with a half-transparent source is where a premultiply
    // mistake shows: an unpremultiplied source doubles its own contribution,
    // so the overlap reads far brighter than the arithmetic allows.
    name: 'blend/alpha-over-solid',
    feature: 'BlendMode',
    size: CANVAS,
    fixture: 'opaque-solid',
    nearestSampled: false,
    build: () => {
      const overlay = square(Color.blue, 8, 8, 48);

      // Transparency comes from the tint's alpha: the engine has no node-level
      // alpha, and this is the path the shader premultiplies.
      overlay.tint = new Color(255, 255, 255, 0.5);

      return rooted(square(Color.red, 8, 8, 48), overlay);
    },
    oracle: {
      reason: 'premultiplied source-over: out = src*a + dst*(1 - a), with src = blue at a = 0.5 over opaque red',
      // The half of an odd 8-bit value has to land somewhere, and the source is
      // premultiplied before the target quantises it a second time.
      tolerance: 2,
      samples: () => [{ x: 32, y: 32, expect: [128, 0, 128, 255], describe: 'blue at 50% over red' }, clearedAt(2, 2)],
    },
  },
  {
    // Additive is `one`/`one` on both colour and alpha, so every value here is
    // an exact integer and the tolerance can be a single step.
    name: 'blend/additive-solid-overlap',
    feature: 'BlendMode',
    size: CANVAS,
    fixture: 'opaque-solid',
    nearestSampled: false,
    build: () => {
      const overlay = square(ADDITIVE_OVERLAY, 24, 24, 32);

      overlay.blendMode = BlendModes.Additive;

      return rooted(square(ADDITIVE_BACKDROP, 8, 8, 32), overlay);
    },
    oracle: {
      reason: 'additive blending: out = src + dst, clamped',
      tolerance: 1,
      samples: () => {
        const sum = (a: number, b: number): number => Math.min(255, a + b);

        return [
          { x: 12, y: 12, expect: [ADDITIVE_BACKDROP.r, ADDITIVE_BACKDROP.g, ADDITIVE_BACKDROP.b, 255], describe: 'backdrop only' },
          {
            x: 32,
            y: 32,
            expect: [
              sum(ADDITIVE_BACKDROP.r, ADDITIVE_OVERLAY.r),
              sum(ADDITIVE_BACKDROP.g, ADDITIVE_OVERLAY.g),
              sum(ADDITIVE_BACKDROP.b, ADDITIVE_OVERLAY.b),
              255,
            ],
            describe: 'backdrop + overlay overlap',
          },
          { x: 48, y: 48, expect: [ADDITIVE_OVERLAY.r, ADDITIVE_OVERLAY.g, ADDITIVE_OVERLAY.b, 255], describe: 'overlay over the cleared canvas' },
          clearedAt(2, 2),
        ];
      },
    },
  },
  {
    // A channel swap is the strictest colour-matrix check that stays exact: it
    // moves whole channels, so a transposed matrix, a row/column mix-up or a
    // straight/premultiplied confusion cannot land on the right answer by
    // accident.
    name: 'filter/color-matrix-channel-swap',
    feature: 'ColorMatrixFilter',
    size: CANVAS,
    fixture: 'opaque-solid',
    nearestSampled: false,
    build: () => {
      const root = rooted(square(new Color(64, 128, 192, 1), 8, 8, 48));

      // Rows are [r, g, b, a, offset]: red takes blue, blue takes red.
      root.filters = [new ColorMatrixFilter([0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0])];

      return root;
    },
    oracle: {
      reason: 'RGBA = M*RGBA with R and B swapped, over an opaque (64, 128, 192) fill',
      // The filter grades on straight alpha, so an opaque pixel makes one round
      // trip through the render target and back.
      tolerance: 2,
      samples: () => [{ x: 32, y: 32, expect: [192, 128, 64, 255], describe: 'swapped fill' }],
    },
  },
  {
    // A ramp is the only colour path here whose expectation depends on *where*
    // the pixel is, which is what makes a reversed or misaligned gradient
    // visible rather than merely different.
    name: 'gradient/linear-black-to-white',
    feature: 'Gradient',
    size: CANVAS,
    fixture: 'interpolated',
    nearestSampled: false,
    build: () => {
      const graphics = new Graphics();

      graphics.fillStyle = new LinearGradient(
        [
          { offset: 0, color: Color.black },
          { offset: 1, color: Color.white },
        ],
        [0, 0],
        [1, 0],
      );
      graphics.drawRectangle(0, 0, CANVAS, CANVAS);

      return rooted(graphics);
    },
    oracle: {
      reason: 'a two-stop black-to-white ramp across the shape bounds: channel = 255 * (x + 0.5) / 64',
      // The ramp is rasterized to a 256px texture and sampled with linear
      // filtering, so the expectation carries a texel of slack on either side.
      // A reversed or misaligned gradient is off by tens of steps, not four.
      tolerance: 4,
      samples: () =>
        [16, 32, 48].map(x => {
          const value = Math.round((255 * (x + 0.5)) / CANVAS);

          return { x, y: 32, expect: [value, value, value, 255] as const, describe: `ramp at x=${x}` };
        }),
    },
  },
];
