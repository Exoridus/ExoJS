import { GlyphSdf } from '@/rendering/text/GlyphSdf';

/**
 * Regression: assigning `canvas.width`/`height` — which {@link GlyphSdf} does
 * whenever the glyph tile size changes — resets the 2D context to its defaults,
 * including `font = "10px sans-serif"`. GlyphSdf must re-apply its font *after*
 * that reset and before `fillText`; otherwise every glyph whose draw triggers a
 * resize rasterizes at 10px instead of the requested size, producing wildly
 * uneven glyph sizes in rendered text.
 *
 * This is real canvas-2D behaviour: jsdom's mocked context does not reset `font`
 * on resize, so the regression only reproduces with a real canvas — hence the
 * browser project. The test only needs Canvas 2D (`getImageData`), not WebGL.
 */

// Vertical extent (in pixels) of the "inside-glyph" region — SDF value >= 128.
function verticalInkExtent(result: { data: Uint8ClampedArray; width: number; height: number }): number {
  const { data, width, height } = result;
  let minY = height;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[y * width + x] >= 128) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        break;
      }
    }
  }

  return maxY - minY + 1;
}

describe('GlyphSdf SDF rasterization', () => {
  const fontSize = 48;

  test('rasterizes the first glyph at the requested size despite the resize-induced context reset', () => {
    const sdf = new GlyphSdf({ fontSize, fontFamily: 'sans-serif' });

    // The very first draw resizes the canvas from its initial 1x1, which resets
    // ctx.font. A correct 48px 'M' fills most of the cap height; the 10px-font
    // regression would leave only ~10px of ink in a ~48px-tall tile.
    const result = sdf.draw('M');

    expect(verticalInkExtent(result)).toBeGreaterThan(result.glyphHeight * 0.5);
  });

  test('keeps every glyph at the requested size across resize and non-resize draws', () => {
    const sdf = new GlyphSdf({ fontSize, fontFamily: 'sans-serif' });

    // Mixed widths: some draws change the tile size (resize), some reuse the
    // previous tile size (no resize). The original bug only corrupted the
    // no-resize draws — the glyph kept the previous draw's 10px reset font.
    for (const char of ['W', 'l', 'i', 'H', 'I', 'M']) {
      const result = sdf.draw(char);

      // Uppercase letters, ascenders and the dotted 'i' all span well over a
      // third of the cell when rasterized correctly; the regression collapses
      // them to ~10px (≈ 0.2 of a 48px cell).
      expect(verticalInkExtent(result), `glyph "${char}"`).toBeGreaterThan(result.glyphHeight * 0.4);
    }
  });
});
