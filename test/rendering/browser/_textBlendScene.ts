/**
 * Shared scene and oracle for the WebGL2/WebGPU `Text.blendMode` specs.
 *
 * `blendMode` is public on every `Drawable`, text included. The check is a
 * single glyph run drawn twice over the same coloured clear, once per blend
 * mode, sampled at a pixel the `Normal` frame proves is fully covered - so the
 * expected values follow from the blend equations alone and do not depend on
 * where the rasterizer put the glyph.
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Text } from '#rendering/text/Text';

import { pixelAt, type RgbaTuple } from './_pixels';

/** Opaque red, so an additive green glyph lands on a distinct yellow. */
export const textBlendClearColor = Color.red;

/** A fully covered glyph pixel under `Normal`: the source replaces the clear. */
export const textNormalExpected: RgbaTuple = [0, 255, 0, 255];

/** The same pixel under `Additive`: source plus clear. */
export const textAdditiveExpected: RgbaTuple = [255, 255, 0, 255];

export interface TextBlendScene {
  readonly root: Container;
  readonly text: Text;
  readonly dispose: () => void;
}

export const buildTextBlendScene = (): TextBlendScene => {
  const root = new Container();
  const text = new Text('M', { fillColor: Color.green, fontSize: 48, fontFamily: 'sans-serif' });

  text.setPosition(4, 4);
  root.addChild(text);

  return { root, text, dispose: (): void => root.destroy() };
};

/**
 * Index of a pixel the glyph covers completely, or `-1`. Anti-aliased edges
 * carry partial coverage, which blends differently under every mode and would
 * make the oracle depend on the rasterizer; only a saturated interior pixel
 * has a value both blend equations predict exactly.
 */
export const findFullyCoveredPixel = (frame: ArrayLike<number>, size: number): { x: number; y: number } | null => {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixelAt(frame, size, x, y);

      if (g >= 250 && r <= 4 && b <= 4) {
        return { x, y };
      }
    }
  }

  return null;
};
