/**
 * A render texture whose four quadrants are four different colours, so a
 * readback that flips, rotates or transposes its rows cannot pass by accident.
 *
 * Shared by both backends: the whole point of `readPixels` is that they agree
 * on the layout, and two specs asserting the same corners against the same
 * scene is what proves it.
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { DrawContext } from '#rendering/DrawContext';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';

/** Side of the square target the scene fills. */
export const SCENE_SIZE = 64;

/** Quadrant colours, clockwise from the top-left corner. */
export const TOP_LEFT = new Color(255, 0, 0);
export const TOP_RIGHT = new Color(0, 255, 0);
export const BOTTOM_RIGHT = new Color(0, 0, 255);
export const BOTTOM_LEFT = new Color(255, 255, 0);

const quadrant = (color: Color, x: number, y: number): Sprite => {
  const sprite = new Sprite(Texture.fromColor(color, 1));

  sprite.width = SCENE_SIZE / 2;
  sprite.height = SCENE_SIZE / 2;
  sprite.setPosition(x, y);

  return sprite;
};

export const buildQuadrantScene = (): Container => {
  const half = SCENE_SIZE / 2;
  const root = new Container();

  root.addChild(quadrant(TOP_LEFT, 0, 0), quadrant(TOP_RIGHT, half, 0), quadrant(BOTTOM_LEFT, 0, half), quadrant(BOTTOM_RIGHT, half, half));

  return root;
};

/**
 * Assert the four quadrants sit where top-down, left-to-right rows put them.
 *
 * Samples the middle of each quadrant rather than its corners, so a half-pixel
 * of sampling slop at the seams cannot decide the result.
 */
export const expectQuadrantLayout = (
  data: Uint8ClampedArray,
  width: number,
  check: (actual: readonly [number, number, number, number], expected: Color, where: string) => void,
  height: number = width,
): void => {
  const at = (x: number, y: number): readonly [number, number, number, number] => {
    const offset = (y * width + x) * 4;

    return [data[offset]!, data[offset + 1]!, data[offset + 2]!, data[offset + 3]!];
  };
  // Relative to what was read, so this holds for a whole-texture read and for a
  // smaller rectangle centred on the same crossing.
  const nearX = Math.floor(width / 4);
  const farX = Math.floor((width * 3) / 4);
  const nearY = Math.floor(height / 4);
  const farY = Math.floor((height * 3) / 4);

  check(at(nearX, nearY), TOP_LEFT, 'top-left');
  check(at(farX, nearY), TOP_RIGHT, 'top-right');
  check(at(nearX, farY), BOTTOM_LEFT, 'bottom-left');
  check(at(farX, farY), BOTTOM_RIGHT, 'bottom-right');
};

/** Render the scene into `target` through whichever context the spec built. */
export const drawQuadrants = (context: DrawContext, target: Parameters<DrawContext['renderTo']>[1]['target']): void => {
  context.renderTo(buildQuadrantScene(), { target, clear: Color.black });
};
