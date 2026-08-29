/**
 * Uniform digit glyph sheet shared by the arms that cannot build a glyph atlas
 * from a system font on their own.
 *
 * The text archetypes compare glyph-atlas text paths: a laid-out string turned
 * into per-glyph quads out of one texture. ExoJS (SDF atlas) and Pixi
 * (`BitmapText` with a dynamically generated bitmap font) each build that atlas
 * themselves from a system font. Phaser 4 and Excalibur 0.32 have no such
 * dynamic path - Phaser's `BitmapText` needs a font asset (or a `RetroFont` grid)
 * and Excalibur's `SpriteFont` needs a sprite sheet - so this module supplies the
 * grid both of them parse.
 *
 * DISCLOSURE, because it is a real asymmetry rather than a detail: an arm handed
 * this sheet never pays to rasterize a glyph, while ExoJS and Pixi rasterize each
 * distinct glyph once into their own atlas. That cost is one-shot and lands in
 * warmup, so the timed window compares steady-state layout and quad generation on
 * every arm - but the first-frame cost of the two dynamic arms is genuinely
 * higher, and the `cold-start` archetype the design defers is where that belongs.
 *
 * The alphabet is digits only, matching `traits.ts::textForLeaf`, so the sheet is
 * ten cells wide and no arm resolves a glyph the others lack.
 */

/** Glyphs on the sheet, in cell order - the alphabet `textForLeaf` draws from. */
export const DIGIT_ALPHABET = '0123456789';

/** Cell width on the sheet, in pixels. Monospace digits at the arms' shared font size fit inside this comfortably. */
export const DIGIT_CELL_WIDTH = 10;

/** Cell height on the sheet, in pixels. */
export const DIGIT_CELL_HEIGHT = 16;

/**
 * Render the digit sheet: one row of {@link DIGIT_ALPHABET}.length cells, each
 * {@link DIGIT_CELL_WIDTH} x {@link DIGIT_CELL_HEIGHT}, white on transparent.
 *
 * `fontSize` is the arms' shared text size, so a glyph on this sheet covers the
 * same on-screen area as the same glyph in an arm's own atlas and the text rows
 * push comparable fill through every arm.
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
