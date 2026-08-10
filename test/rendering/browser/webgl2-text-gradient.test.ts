/**
 * WebGL2 browser test — the gradient ramp is normalized against the text INK.
 *
 * `text.vert` computes `v_gradUV = clamp((a_position - box.xy) / box.zw)` from
 * the rectangle the renderer uploads, and `text-sdf.frag` mixes the two ramp
 * colours by that fraction. Uploading the advance extent instead of the ink
 * runs the ramp against a box the glyph quads do not sit in: its origin is
 * (0, 0) while the SDF quads start at a negative offset, so every glyph row
 * samples the ramp at the wrong place and the clamp eats the overhang.
 *
 * The check does not depend on the shape of the glyph. With a pure red/blue
 * vertical ramp, `r / (r + b)` at any covered pixel IS the ramp fraction, and
 * the ramp fraction is a closed form of the uploaded box — so each ink row can
 * be predicted from `text.getLocalBounds()` and compared. Partial coverage
 * scales both channels equally and cancels out of the ratio.
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { readWebGl2Frame } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';

const canvasSize = 96;
const textY = 8;

const createBackend = async (): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const app: Application = {
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width: canvasSize, height: canvasSize },
      rendering: {
        debug: false,
        webglAttributes: {
          alpha: false,
          antialias: false,
          premultipliedAlpha: false,
          preserveDrawingBuffer: true,
          stencil: false,
          depth: false,
        },
        spriteRendererBatchSize: 1024,
        particleRendererBatchSize: 1024,
      },
    },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireCoreRenderers(backend, app.options.rendering);

  return backend;
};

const render = (backend: WebGl2Backend, node: RenderNode): void => {
  backend.resetStats();
  backend.clear(Color.black);
  node.render(backend);
  backend.flush();
};

/**
 * Per row, the red share of the strongest covered pixel. Rows whose strongest
 * pixel is too faint carry too little signal to read a ratio out of and are
 * dropped.
 */
const rowRedShares = (frame: Uint8Array): ReadonlyArray<{ y: number; share: number }> => {
  const rows: Array<{ y: number; share: number }> = [];

  for (let y = 0; y < canvasSize; y++) {
    let bestTotal = 0;
    let bestShare = 0;

    for (let x = 0; x < canvasSize; x++) {
      const i = (y * canvasSize + x) * 4;
      const r = frame[i]!;
      const b = frame[i + 2]!;
      const total = r + b;

      if (total > bestTotal) {
        bestTotal = total;
        bestShare = r / total;
      }
    }

    if (bestTotal >= 160) rows.push({ y, share: bestShare });
  }

  return rows;
};

describe('WebGL2: the text gradient ramp spans the ink extent', () => {
  beforeEach(() => resetDefaultGlyphAtlasPool());
  afterEach(() => resetDefaultGlyphAtlasPool());

  test('every ink row samples the ramp at the fraction its ink position implies', async () => {
    const backend = await createBackend();
    const root = new Container();
    // 'M' is wide and solid, so most rows carry a strong, unambiguous sample.
    // gradientColors[0] feeds the shader's ramp-1.0 end, [1] its ramp-0.0 end.
    const text = new Text('M', {
      fontSize: 56,
      fillColor: Color.white,
      gradientColors: [Color.red, Color.blue],
      gradientAxis: 'vertical',
    });

    text.setPosition(8, textY);
    root.addChild(text);

    try {
      render(backend, root);

      const rows = rowRedShares(readWebGl2Frame(backend, canvasSize));
      const ink = text.getLocalBounds();

      // Enough rows to make the per-row claim below more than a spot check.
      expect(rows.length).toBeGreaterThan(20);

      // The ink here is (-8, -8, 59, 79) against an advance of (46.6, 67.2):
      // both the origin and the span differ, so predicting from one box and
      // rendering from the other misses by far more than the slack below.
      expect(ink.y).toBeLessThan(0);
      expect(ink.height).not.toBe(text.textBounds.height);

      for (const { y, share } of rows) {
        // The shader interpolates at the pixel centre.
        const localY = y + 0.5 - textY;
        const expected = Math.min(1, Math.max(0, (localY - ink.y) / ink.height));

        // Measured agreement is within 0.001 on every ink row; the slack
        // covers adapter rounding, not a difference of interpretation.
        expect(Math.abs(share - expected), `row ${y}: red share ${share.toFixed(3)}, expected ${expected.toFixed(3)}`).toBeLessThan(0.02);
      }
    } finally {
      root.destroy();
      backend.destroy();
    }
  });
});
