/**
 * Entry point for the table-driven conformance matrix.
 *
 * Adding a feature means adding a scene to a catalog; adding a correctness
 * check means adding a property, which then applies to every existing scene.
 * Neither requires touching this file beyond one import and one list entry.
 *
 * Run via:  pnpm test:parity  (or :firefox / :webkit)
 */

import { crossBackendParity } from './properties/crossBackendParity';
import { determinism } from './properties/determinism';
import { rendersSomething } from './properties/rendersSomething';
import { runParityMatrix } from './runner';
import { clippingScenes } from './scenes/clipping';
import { colourScenes } from './scenes/colour';
import { graphicsScenes } from './scenes/graphics';
import { meshScenes } from './scenes/mesh';
import { nineSliceScenes } from './scenes/nineSlice';
import { particleScenes } from './scenes/particles';
import { renderBatchScenes } from './scenes/renderBatch';
import { repeatingSpriteScenes } from './scenes/repeatingSprite';
import { spriteScenes } from './scenes/sprite';
import { spriteCanvasScenes } from './scenes/spriteCanvas';
import { textScenes } from './scenes/text';
import { tilemapScenes } from './scenes/tilemap';
import { transformScenes } from './scenes/transform';
import type { Property, Scene } from './types';

const scenes: readonly Scene[] = [
  ...spriteScenes,
  ...spriteCanvasScenes,
  ...nineSliceScenes,
  ...repeatingSpriteScenes,
  ...meshScenes,
  ...renderBatchScenes,
  ...transformScenes,
  ...graphicsScenes,
  ...colourScenes,
  ...clippingScenes,
  ...textScenes,
  ...tilemapScenes,
  ...particleScenes,
];

const properties: readonly Property[] = [crossBackendParity, determinism, rendersSomething];

runParityMatrix(scenes, properties);
