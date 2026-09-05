/**
 * WebGPU browser test - underline and strikethrough actually reach the frame,
 * and an explicit rule colour reaches only the rules.
 *
 * A decoration is the one text quad that carries no glyph: it samples a solid
 * block the atlas reserves, and the fragment stage tells it apart from a glyph
 * interior by a flag bit packed into the per-vertex word. Nothing about that
 * chain is visible to a layout test - the quad geometry can be perfect while
 * the bit is dropped, the block is transparent, or the WGSL reads the wrong
 * node texel - and the result is either a missing rule or a mis-coloured one.
 *
 * The WebGL2 counterpart pins the same three claims against the GLSL stage;
 * the two are separate sources, so only a test per backend keeps them aligned.
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
const fontSize = 40;

/** The widest lit horizontal run on each row, so a rule stands out from a glyph stem. */
const widestRun = (frame: ArrayLike<number>, y: number): number => {
  let best = 0;
  let run = 0;

  for (let x = 0; x < canvasSize; x++) {
    const i = (y * canvasSize + x) * 4;
    const lit = frame[i]! + frame[i + 1]! + frame[i + 2]! > 240;

    run = lit ? run + 1 : 0;
    if (run > best) best = run;
  }

  return best;
};

/** The row carrying the widest lit run below the glyphs, where an underline must be. */
const widestRunBelow = (frame: ArrayLike<number>, from: number): { y: number; width: number } => {
  let best = { y: -1, width: 0 };

  for (let y = from; y < canvasSize; y++) {
    const width = widestRun(frame, y);

    if (width > best.width) best = { y, width };
  }

  return best;
};

describe('WebGPU: text decorations', () => {
  beforeEach(() => resetDefaultGlyphAtlasPool());
  afterEach(() => resetDefaultGlyphAtlasPool());

  test('an underline draws a run as wide as the line, below every glyph', async ctx => {
    const backend = await createWebGpuTestBackend(canvasSize);
    const root = new Container();
    const plain = new Text('nn', { fontSize, fillColor: Color.white });
    const ruled = new Text('nn', { fontSize, fillColor: Color.white, underline: true });

    plain.setPosition(8, textY);
    ruled.setPosition(8, textY);

    try {
      root.addChild(plain);

      if (!(await renderWebGpuOnce(ctx, backend, root))) return;

      // 'n' has no descender, so below the baseline the only lit pixels are
      // the antialiased feet of its stems - a few pixels wide at most.
      const baselineRow = Math.round(textY + fontSize * 0.85);
      const before = widestRunBelow(readWebGpuFrame(backend, canvasSize), baselineRow);

      root.removeChildren();
      root.addChild(ruled);

      await renderWebGpuOnce(ctx, backend, root);

      const after = widestRunBelow(readWebGpuFrame(backend, canvasSize), baselineRow);

      // The rule spans the line's advance, which dwarfs a stem foot.
      expect(after.width).toBeGreaterThan(ruled.textBounds.width * 0.8);
      expect(after.width).toBeGreaterThan(before.width * 4);
    } finally {
      root.destroy();
      backend.destroy();
    }
  });

  test('a strikethrough crosses the letters rather than sitting under them', async ctx => {
    const backend = await createWebGpuTestBackend(canvasSize);
    const root = new Container();
    const text = new Text('nn', { fontSize, fillColor: Color.white, strikethrough: true });

    text.setPosition(8, textY);
    root.addChild(text);

    try {
      if (!(await renderWebGpuOnce(ctx, backend, root))) return;

      const frame = readWebGpuFrame(backend, canvasSize);
      const baselineRow = Math.round(textY + fontSize * 0.85);
      let struck = -1;

      for (let y = textY; y < baselineRow; y++) {
        if (widestRun(frame, y) > text.textBounds.width * 0.8) struck = y;
      }

      expect(struck).toBeGreaterThan(textY);
      expect(struck).toBeLessThan(baselineRow);
      // Nothing that wide may appear below the baseline: this node asked for a
      // strikethrough only, so what is left down there are stem feet.
      expect(widestRunBelow(frame, baselineRow).width).toBeLessThan(text.textBounds.width * 0.3);
    } finally {
      root.destroy();
      backend.destroy();
    }
  });

  test('decorationColor paints the rule without touching the glyphs', async ctx => {
    const backend = await createWebGpuTestBackend(canvasSize);
    const root = new Container();
    const text = new Text('nn', { fontSize, fillColor: Color.white, underline: true, decorationColor: Color.red });

    text.setPosition(8, textY);
    root.addChild(text);

    try {
      if (!(await renderWebGpuOnce(ctx, backend, root))) return;

      const frame = readWebGpuFrame(backend, canvasSize);
      const baselineRow = Math.round(textY + fontSize * 0.85);
      const rule = widestRunBelow(frame, baselineRow);

      expect(rule.width).toBeGreaterThan(text.textBounds.width * 0.8);

      // Sample the middle of the rule and the middle of a glyph row.
      const ruleTexel = (rule.y * canvasSize + 8 + Math.floor(rule.width / 2)) * 4;

      expect(frame[ruleTexel]!).toBeGreaterThan(200);
      expect(frame[ruleTexel + 1]!).toBeLessThan(60);
      expect(frame[ruleTexel + 2]!).toBeLessThan(60);

      // The glyphs stay white - only the rule takes the override.
      let whiteGlyphPixels = 0;

      for (let y = textY; y < baselineRow - 4; y++) {
        for (let x = 0; x < canvasSize; x++) {
          const i = (y * canvasSize + x) * 4;

          if (frame[i]! > 200 && frame[i + 1]! > 200 && frame[i + 2]! > 200) whiteGlyphPixels++;
        }
      }

      expect(whiteGlyphPixels).toBeGreaterThan(20);
    } finally {
      root.destroy();
      backend.destroy();
    }
  });
});
