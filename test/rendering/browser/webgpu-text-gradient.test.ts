/**
 * WebGPU counterpart to `webgl2-text-gradient.test.ts` - the ORIENTATION of the
 * two-stop text gradient.
 *
 * Both backends pack the stop colours into node texels 10 onwards and derive
 * the ramp fraction from a `gradUV` that is 0 at the
 * top/left edge of the ink box. The two fragment stages therefore have to mix
 * in the same direction; they are separate sources (GLSL files vs inline WGSL),
 * so nothing but a test per backend keeps them from drifting apart. The
 * cross-backend parity suite renders plain white text and would not notice.
 *
 * The measurement is the WebGL2 one: with a pure red/blue ramp, `r / (r + b)`
 * at any covered pixel is the weight of the red (first) stop, and partial
 * glyph coverage scales both channels equally so it cancels out of the ratio.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';

import { createWebGpuTestBackend, readWebGpuFrame, renderWebGpuOnce } from './_backendSetup';

const canvasSize = 96;
const textY = 8;

/**
 * Per row, the red share of the strongest covered pixel. Rows whose strongest
 * pixel is too faint carry too little signal to read a ratio out of.
 */
const rowRedShares = (frame: ArrayLike<number>): ReadonlyArray<{ y: number; share: number }> => {
  const rows: Array<{ y: number; share: number }> = [];

  for (let y = 0; y < canvasSize; y++) {
    let bestTotal = 0;
    let bestShare = 0;

    for (let x = 0; x < canvasSize; x++) {
      const i = (y * canvasSize + x) * 4;
      const total = frame[i]! + frame[i + 2]!;

      if (total > bestTotal) {
        bestTotal = total;
        bestShare = frame[i]! / total;
      }
    }

    if (bestTotal >= 160) rows.push({ y, share: bestShare });
  }

  return rows;
};

describe('WebGPU: the text gradient runs from its first stop at the top', () => {
  beforeEach(() => resetDefaultGlyphAtlasPool());
  afterEach(() => resetDefaultGlyphAtlasPool());

  test('the first stop dominates the top of the ink box and fades out towards the bottom', async ctx => {
    const backend = await createWebGpuTestBackend(canvasSize);
    const root = new Container();
    // 'M' is wide and solid, so most rows carry a strong, unambiguous sample.
    const text = new Text('M', {
      fontSize: 56,
      fillColor: Color.white,
      gradient: {
        stops: [
          { offset: 0, color: Color.red },
          { offset: 1, color: Color.blue },
        ],
      },
    });

    text.setPosition(8, textY);
    root.addChild(text);

    try {
      if (!(await renderWebGpuOnce(ctx, backend, root))) return;

      const rows = rowRedShares(readWebGpuFrame(backend, canvasSize));
      const ink = text.getLocalBounds();

      // Enough rows to make the per-row claim below more than a spot check.
      expect(rows.length).toBeGreaterThan(20);

      for (const { y, share } of rows) {
        // The shader interpolates at the pixel centre.
        const t = Math.min(1, Math.max(0, (y + 0.5 - textY - ink.y) / ink.height));
        // Red is the first stop - the TOP one - so its share is 1 at the
        // top of the ink box and falls to 0 at the bottom. A flipped mix would
        // produce `t` here instead, missing by |2t - 1| on every row but the
        // midpoint.
        const expected = 1 - t;

        expect(Math.abs(share - expected), `row ${y}: red share ${share.toFixed(3)}, expected ${expected.toFixed(3)}`).toBeLessThan(0.04);
      }

      // Orientation stated without the closed form. Glyph coverage never
      // reaches the padded edges of the ink box, so this compares the rows that
      // actually carry signal rather than the ramp's endpoints.
      const first = rows[0]!;
      const last = rows[rows.length - 1]!;

      expect(
        first.share - last.share,
        `red must fall from row ${first.y} (${first.share.toFixed(3)}) to row ${last.y} (${last.share.toFixed(3)})`,
      ).toBeGreaterThan(0.2);
    } finally {
      root.destroy();
      backend.destroy();
    }
  });
});
