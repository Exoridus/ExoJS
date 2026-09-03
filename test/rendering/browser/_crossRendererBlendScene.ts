/**
 * Shared scene for the WebGL2/WebGPU cross-renderer blend specs.
 *
 * Blend state on WebGL2 is one global the backend owns, while each renderer
 * batches independently. A scene that alternates renderer types with different
 * blend modes is therefore the only shape that can observe a renderer applying
 * the state another renderer left behind - and the same scene must produce the
 * same pixels on WebGPU, where blend lives in the pipeline.
 *
 * The three nodes overlap corner to corner in document order, so the draw order
 * is a correctness constraint the render plan cannot regroup away. Each is
 * sampled where nothing else covers it, so the expected value follows
 * analytically from its own blend mode over the clear colour and a wrong blend
 * is a wrong pixel rather than a wrong composite.
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Graphics } from '#rendering/primitives/Graphics';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes } from '#rendering/types';

import type { RgbaTuple } from './_pixels';

/** A `size`x`size` solid-colour texture. */
export const createSolidTexture = (color: string, size = 16): Texture => {
  const canvas = document.createElement('canvas');

  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  return new Texture(canvas);
};

/** Deep blue, chosen so an additive draw over it stays inside the 8-bit range. */
export const blendClearColor = new Color(0, 0, 64, 1);

/** Sample point per node, plus one on the untouched background. */
export const blendSamples = {
  additiveSprite: [4, 4],
  normalMesh: [20, 20],
  additiveSpriteAfterMesh: [34, 34],
  background: [52, 8],
} as const;

/**
 * Analytic result per sample: `Additive` is `src + dst` (WebGL2 `ONE, ONE`;
 * WebGPU `one`/`one`), `Normal` is `src + dst * (1 - src.a)`, which for an
 * opaque source is the source.
 */
export const blendExpected: Record<keyof typeof blendSamples, RgbaTuple> = {
  additiveSprite: [255, 0, 64, 255],
  normalMesh: [0, 255, 0, 255],
  additiveSpriteAfterMesh: [0, 128, 64, 255],
  background: [0, 0, 64, 255],
};

export interface CrossRendererBlendScene {
  readonly root: Container;
  readonly dispose: () => void;
}

/**
 * `Sprite(Additive)`, `Graphics(Normal)`, `Sprite(Additive)` in document order:
 * the mesh renderer between the two sprite batches is what leaves the global
 * blend state on `Normal` while the second sprite batch declares `Additive`.
 */
export const buildCrossRendererBlendScene = (): CrossRendererBlendScene => {
  const red = createSolidTexture('#ff0000');
  const dim = createSolidTexture('#008000');
  const root = new Container();

  const first = new Sprite(red);

  first.setPosition(0, 0);
  first.blendMode = BlendModes.Additive;

  const mesh = new Graphics();

  mesh.fillStyle = Color.green;
  mesh.drawRectangle(0, 0, 16, 16);
  mesh.setPosition(12, 12);

  const second = new Sprite(dim);

  second.setPosition(24, 24);
  second.blendMode = BlendModes.Additive;

  root.addChild(first, mesh, second);

  return {
    root,
    dispose: (): void => {
      root.destroy();
      red.destroy();
      dim.destroy();
    },
  };
};
