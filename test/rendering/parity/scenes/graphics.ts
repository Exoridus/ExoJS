/**
 * Vector primitive scenes.
 *
 * Graphics draws no texture at all - geometry is generated from the fill
 * commands themselves, so this is the one family where the two backends can
 * disagree about triangulation rather than about sampling. Nothing here is
 * traceable to a texel; the honest claim is that both backends produced the
 * same frame.
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Graphics } from '#rendering/primitives/Graphics';

import type { Scene } from '../types';

const CANVAS = 64;

const rooted = (graphics: Graphics): Container => {
  const root = new Container();

  root.addChild(graphics);

  return root;
};

export const graphicsScenes: readonly Scene[] = [
  {
    name: 'graphics/solid-rectangle',
    feature: 'Graphics',
    size: CANVAS,
    fixture: 'opaque-solid',
    nearestSampled: false,
    build: () => {
      const graphics = new Graphics();

      graphics.fillStyle = Color.green;
      graphics.drawRectangle(8, 8, 32, 32);

      return rooted(graphics);
    },
  },
  {
    // Two overlapping fills: the second must land on top of the first
    // identically on both backends, which is a statement about draw order
    // rather than about either shape alone.
    name: 'graphics/overlapping-fills',
    feature: 'Graphics',
    size: CANVAS,
    fixture: 'opaque-solid',
    nearestSampled: false,
    build: () => {
      const graphics = new Graphics();

      graphics.fillStyle = Color.red;
      graphics.drawRectangle(8, 8, 32, 32);
      graphics.fillStyle = Color.blue;
      graphics.drawRectangle(24, 24, 32, 32);

      return rooted(graphics);
    },
  },
];
