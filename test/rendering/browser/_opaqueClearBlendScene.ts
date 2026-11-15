/**
 * Shared scene for the WebGL2/WebGPU opaque-clear blend specs.
 *
 * A render texture cleared to an opaque colour is fully covered for the rest of
 * the frame, so {@link BlendModes.Multiply} may keep its fixed-function
 * shortcut there. The specs prove that by rendering the same picture twice:
 * once over an opaque clear (the shortcut), and once over a transparent clear
 * that an opaque full-frame sprite then paints over (identical coverage, but
 * nothing the engine can prove, so Multiply goes through the backdrop
 * compositor). Both frames have to agree pixel for pixel.
 *
 * The backdrop is not flat: a stripe overlaps an additive stripe, so every
 * blend mode is sampled over a clamped additive accumulation as well as over
 * plain colour, at full and at half source coverage.
 */

import { expect } from 'vitest';

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import type { Texture } from '#rendering/texture/Texture';
import { BlendModes } from '#rendering/types';

import { createSolidTexture } from './_crossRendererBlendScene';

export const opaqueClearSize = 64;

/** The clear colour of the opaque frame - and the fill of the transparent one. */
export const opaqueClearColor = new Color(40, 60, 90, 1);

const opaqueClearCss = 'rgb(40, 60, 90)';

export const testedBlendModes = [BlendModes.Normal, BlendModes.Additive, BlendModes.Multiply, BlendModes.Screen] as const;

export interface OpaqueClearBlendScene {
  readonly root: Container;
  readonly dispose: () => void;
}

/**
 * The full picture. `fill` paints the frame with {@link opaqueClearColor}
 * first, for the frame whose clear leaves it transparent.
 */
export const buildOpaqueClearBlendScene = (fill: boolean): OpaqueClearBlendScene => {
  const textures: Texture[] = [];

  const texture = (css: string, size = 16): Texture => {
    const created = createSolidTexture(css, size);

    textures.push(created);

    return created;
  };

  const root = new Container();

  if (fill) {
    root.addChild(new Sprite(texture(opaqueClearCss, opaqueClearSize)));
  }

  const stripe = new Sprite(texture('rgb(30, 160, 60)', opaqueClearSize));

  stripe.setPosition(0, -opaqueClearSize / 2);

  const glow = new Sprite(texture('rgb(230, 120, 40)', opaqueClearSize));

  glow.setPosition(0, opaqueClearSize / 4);
  glow.blendMode = BlendModes.Additive;
  root.addChild(stripe, glow);

  testedBlendModes.forEach((mode, index) => {
    const opaque = new Sprite(texture('rgb(140, 200, 250)'));
    const translucent = new Sprite(texture('rgba(250, 90, 160, 0.5)'));

    opaque.setPosition(index * 16, 0);
    opaque.height = opaqueClearSize;
    opaque.width = 8;
    opaque.blendMode = mode;
    translucent.setPosition(index * 16 + 8, 0);
    translucent.height = opaqueClearSize;
    translucent.width = 8;
    translucent.blendMode = mode;
    root.addChild(opaque, translucent);
  });

  return {
    root,
    dispose: (): void => {
      root.destroy();

      for (const created of textures) {
        created.destroy();
      }
    },
  };
};

/** Every channel of two top-left-indexed RGBA frames within `tolerance`, reported by first offending pixel. */
export const expectFramesNear = (actual: ArrayLike<number>, expected: ArrayLike<number>, tolerance: number): void => {
  expect(actual.length).toBe(expected.length);

  for (let index = 0; index < actual.length; index++) {
    const delta = Math.abs(actual[index]! - expected[index]!);

    if (delta > tolerance) {
      const pixel = Math.floor(index / 4);

      expect.fail(
        `pixel (${pixel % opaqueClearSize}, ${Math.floor(pixel / opaqueClearSize)}) channel ${index % 4}: ` +
          `${actual[index]} vs ${expected[index]} (tolerance ${tolerance})`,
      );
    }
  }
};
