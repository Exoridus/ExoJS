import { TILE_SIZE, TILE_VARIANTS } from './tilemap';
import { SPRITE_SIZE } from './world';

/**
 * Engine-neutral raster assets every arm's scenes are built from.
 *
 * Each arm wraps these canvases in its own texture type, but the PIXELS come
 * from here. Four private copies of one generator is how an arm ends up with a
 * differently-sized quad or a differently-shaped glyph sheet - a scene difference
 * the matrix would then report as an engine difference.
 */

/** Font size, in logical pixels, of every text leaf on every arm. */
export const TEXT_FONT_SIZE = 12;

/** Glyphs on the digit sheet, in cell order - the alphabet `traits.ts::textForLeaf` draws from. */
export const DIGIT_ALPHABET = '0123456789';

/** Cell width on the digit sheet, in pixels. Monospace digits at {@link TEXT_FONT_SIZE} fit inside it comfortably. */
export const DIGIT_CELL_WIDTH = 10;

/** Cell height on the digit sheet, in pixels. */
export const DIGIT_CELL_HEIGHT = 16;

/**
 * One of `total` visually distinct solid-colour {@link SPRITE_SIZE} canvases.
 *
 * Distinct texture IDENTITIES are what make the `batch-breaking` archetype break
 * batches: each canvas becomes a separate GPU texture, so a batcher's slot
 * ceiling is genuinely overflowed rather than nominally so. The colours differ
 * only to make a captured frame readable; nothing measures them.
 */
export const createDistinctTextureCanvas = (index: number, total: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');

  canvas.width = SPRITE_SIZE;
  canvas.height = SPRITE_SIZE;

  const context = canvas.getContext('2d');

  if (context === null) {
    throw new Error('A 2D context is required to generate benchmark textures.');
  }

  const hue = total > 1 ? Math.round((index / total) * 360) : 210;

  context.fillStyle = `hsl(${hue}, 70%, 55%)`;
  context.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

  return canvas;
};

/**
 * The tile atlas: one row of {@link TILE_VARIANTS} cells of {@link TILE_SIZE}
 * pixels, each a flat distinct colour with a one-pixel darker border.
 *
 * One row and one page, so every arm resolves its tiles out of a single texture
 * and none of them pays a texture-slot or page-switch cost the others avoid. The
 * border is what makes a captured frame readable as a tile grid rather than as a
 * colour field, which is how a scroll or an edit is checked by eye; nothing
 * measures it.
 */
export const createTileAtlasCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');

  canvas.width = TILE_SIZE * TILE_VARIANTS;
  canvas.height = TILE_SIZE;

  const context = canvas.getContext('2d');

  if (context === null) {
    throw new Error('A 2D context is required to generate the benchmark tile atlas.');
  }

  for (let index = 0; index < TILE_VARIANTS; index += 1) {
    const hue = Math.round((index / TILE_VARIANTS) * 360);

    context.fillStyle = `hsl(${hue}, 65%, 52%)`;
    context.fillRect(index * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE);
    context.fillStyle = `hsl(${hue}, 65%, 32%)`;
    context.fillRect(index * TILE_SIZE, 0, TILE_SIZE, 1);
    context.fillRect(index * TILE_SIZE, 0, 1, TILE_SIZE);
  }

  return canvas;
};

/**
 * The digit glyph sheet: one row of {@link DIGIT_ALPHABET}.length cells, white on
 * transparent.
 *
 * The text archetypes compare glyph-atlas text paths. ExoJS (an SDF atlas) and
 * Pixi (`BitmapText` over a dynamically generated bitmap font) build that atlas
 * themselves from a system font; Phaser 4 and Excalibur 0.32 have no dynamic
 * path - Phaser's `BitmapText` needs a font asset or a `RetroFont` grid, and
 * Excalibur's `SpriteFont` needs a sprite sheet - so this is the grid both of
 * them parse.
 *
 * DISCLOSURE, because it is a real asymmetry rather than a detail: an arm handed
 * this sheet never pays to rasterize a glyph, while ExoJS and Pixi rasterize each
 * distinct glyph once into their own atlas. That cost is one-shot and lands in
 * warmup, so the timed window compares steady-state layout and quad generation on
 * every arm - but the first frame of the two dynamic arms is genuinely more
 * expensive, and the deferred `cold-start` archetype is where that belongs.
 */
export const createDigitAtlasCanvas = (fontSize: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');

  canvas.width = DIGIT_CELL_WIDTH * DIGIT_ALPHABET.length;
  canvas.height = DIGIT_CELL_HEIGHT;

  const context = canvas.getContext('2d');

  if (context === null) {
    throw new Error('A 2D context is required to generate the benchmark digit atlas.');
  }

  context.font = `${fontSize}px monospace`;
  context.fillStyle = '#ffffff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  for (const [index, glyph] of [...DIGIT_ALPHABET].entries()) {
    context.fillText(glyph, index * DIGIT_CELL_WIDTH + DIGIT_CELL_WIDTH / 2, DIGIT_CELL_HEIGHT / 2);
  }

  return canvas;
};
