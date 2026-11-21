/**
 * The text effect unit matrix, written once and run against each backend.
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Graphics } from '#rendering/primitives/Graphics';
import type { RenderNode } from '#rendering/RenderNode';
import { getDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';
import { TextEffectError } from '#rendering/text/TextEffectError';
import { Button } from '#ui/Button';
import { Checkbox } from '#ui/Checkbox';
import { Dropdown } from '#ui/Dropdown';
import { createUITheme } from '#ui/theme';
import { Toggle } from '#ui/Toggle';
import { UIRoot } from '#ui/UIRoot';

import type { EdgeCase, Frame } from './_textEffectUnits';
import {
  buildOutlineScene,
  buildShadowScene,
  effectCanvasSize,
  frameDifference,
  litColumns,
  measureOutlineWidth,
  measureShadowOverhang,
  measureShadowRamp,
  nodeScales,
  outlineWidths,
  rasterPhaseFontSizes,
  screenPhaseOffsets,
  sdfRadii,
  summarize,
  surfaceRatios,
} from './_textEffectUnits';

interface SkipContext {
  skip: (reason: string) => void;
}

export interface EffectBackendSession {
  /** Draws `root` alone on black and returns the frame, or `null` when the device was lost and the test skipped. */
  draw: (root: RenderNode, ctx: SkipContext) => Promise<Frame | null>;
  close: () => void;
}

export interface EffectBackendDriver {
  open: (size: number, surfaceRatio: number) => Promise<EffectBackendSession>;
}

/**
 * Allowed error of a measured width, in local logical pixels, as `[mae, p99]`
 * over all raster and screen phases of one case.
 *
 * Two independent sources, each in its own unit. The distance field is built
 * from an antialiased canvas raster by a distance transform that keeps the
 * zero crossing exact but can misplace distances further out by up to half a
 * RASTER pixel depending on where the edge falls inside its pixel; averaged
 * over phases that error largely cancels. Locating a 50 % crossing between two
 * pixel centres costs a fraction of a DEVICE pixel.
 */
const widthTolerance = (devicePerLocal: number, rasterPerLocal: number): [number, number] => [
  0.35 / rasterPerLocal + 0.2 / devicePerLocal,
  0.5 / rasterPerLocal + 0.5 / devicePerLocal,
];

/**
 * Checks one case against the antialiasing guarantee domain.
 *
 * At two device pixels or more the visible width must match the request
 * within {@link widthTolerance}. Narrower, the half-pixel fades of the effect
 * edge and of the glyph edge it starts from run into each other: between one
 * and two device pixels the width may read up to 40 % short, below one device
 * pixel the effect only has to stay visible and not grow.
 */
const judgeWidth = (
  summary: { mean: number; mae: number; p99: number },
  expected: number,
  devicePerLocal: number,
  rasterPerLocal: number,
): boolean => {
  const [maeLimit, p99Limit] = widthTolerance(devicePerLocal, rasterPerLocal);
  const deviceWidth = expected * devicePerLocal;

  if (deviceWidth >= 2) {
    return summary.mae <= maeLimit && summary.p99 <= p99Limit;
  }

  const floor = deviceWidth >= 1 ? 0.6 * expected : 0;

  return summary.mean > floor && summary.mean <= expected + maeLimit;
};

const phases = rasterPhaseFontSizes.flatMap(fontSize => screenPhaseOffsets.map(deviceOffset => ({ fontSize, deviceOffset })));

export const runEffectUnitSuite = (backendName: string, driver: EffectBackendDriver): void => {
  describe(`${backendName} outline width is logical pixels`, () => {
    test.each(surfaceRatios)('at surface pixel ratio %i, across sdfRadius × outline × node scale', async surfaceRatio => {
      const session = await driver.open(effectCanvasSize, surfaceRatio);
      const rows: string[] = [];
      const failures: string[] = [];

      try {
        for (const sdfRadius of sdfRadii) {
          for (const outlineWidth of outlineWidths) {
            for (const scale of nodeScales) {
              const testCase: EdgeCase = { outlineWidth, sdfRadius, surfaceRatio, scale };

              if (outlineWidth + 1 > sdfRadius) {
                expect(() => buildOutlineScene(testCase)).toThrow(TextEffectError);
                rows.push(`R${sdfRadius} w${outlineWidth} s${scale}: rejected (capacity)`);
                continue;
              }

              const phaseMeans: number[] = [];
              let rowCount = Number.POSITIVE_INFINITY;

              for (const phase of phases) {
                const { root, text } = buildOutlineScene(testCase, phase);
                const frame = await session.draw(root, ctxProxy);

                text.destroy();

                if (frame === null) {
                  return;
                }

                const sample = measureOutlineWidth(frame, effectCanvasSize, testCase);

                rowCount = Math.min(rowCount, sample.widths.length);
                phaseMeans.push(sample.mean);
              }

              const summary = summarize(phaseMeans, outlineWidth);
              const [maeLimit, p99Limit] = widthTolerance(surfaceRatio * scale, surfaceRatio);

              rows.push(
                `R${sdfRadius} w${outlineWidth} s${scale}: mean ${summary.mean.toFixed(3)} MAE ${summary.mae.toFixed(3)}/${maeLimit.toFixed(3)} ` +
                  `P99 ${summary.p99.toFixed(3)}/${p99Limit.toFixed(3)} rows>=${rowCount}`,
              );

              if (rowCount < 6 || !judgeWidth(summary, outlineWidth, surfaceRatio * scale, surfaceRatio)) {
                failures.push(rows[rows.length - 1]!);
              }
            }
          }
        }
      } finally {
        session.close();
        console.info(`[${backendName} outline px, surface ratio ${surfaceRatio}]\n${rows.join('\n')}`);
      }

      expect(failures.join('\n')).toBe('');
    });
  });

  describe(`${backendName} automatic reach`, () => {
    // No sdfRadius anywhere: an ordinary outline just works, and the visible
    // width holds across the tiers the node moves through.
    test.for(surfaceRatios)(
      'outline 1, 2, 4, 8, 12, 16, 24 and 48 px with no configuration at surface ratio %i',
      async (surfaceRatio, ctx) => {
        const session = await driver.open(effectCanvasSize, surfaceRatio);
        const rows: string[] = [];
        const failures: string[] = [];

        try {
          for (const outlineWidth of [1, 2, 4, 8, 12, 16, 24, 48]) {
            const testCase: EdgeCase = { outlineWidth, surfaceRatio, scale: 1 };
            const phaseMeans: number[] = [];

            for (const phase of phases) {
              const { root, text } = buildOutlineScene(testCase, phase);
              const frame = await session.draw(root, ctx);

              text.destroy();

              if (frame === null) {
                return;
              }

              phaseMeans.push(measureOutlineWidth(frame, effectCanvasSize, testCase).mean);
            }

            const summary = summarize(phaseMeans, outlineWidth);

            rows.push(`auto w${outlineWidth}: mean ${summary.mean.toFixed(3)} MAE ${summary.mae.toFixed(3)}`);

            if (!judgeWidth(summary, outlineWidth, surfaceRatio, surfaceRatio)) {
              failures.push(rows[rows.length - 1]!);
            }
          }
        } finally {
          session.close();
          console.info(`[${backendName} automatic reach, surface ratio ${surfaceRatio}]\n${rows.join('\n')}`);
        }

        expect(failures.join('\n')).toBe('');
      },
    );
  });

  describe(`${backendName} widget label fill alignment`, () => {
    test('rejects a theme whose active glyph cannot fit without changing siblings', () => {
      const root = new UIRoot();
      const first = new Button({ label: 'Start' });
      const second = new Button({ label: 'Play' }).setTextStyle({ fontFamily: 'monospace' });
      root.addChild(first, second);
      const previous = root.theme;
      const patch = createUITheme({ button: { normal: { text: { fontSize: 2000, outlineWidth: 24 } } } });

      try {
        expect(() => {
          root.theme = patch;
        }).toThrow(/atlas page/);
        expect(root.theme).toBe(previous);
        expect(first.theme).toBe(previous);
        expect(second.theme).toBe(previous);
        expect(first.labelNode.style.fontSize).toBe(16);
      } finally {
        root.destroy();
      }
    });

    test.for(surfaceRatios)('keeps rendered text centered through layout and asynchronous font changes at DPR %i', async (ratio, ctx) => {
      const size = effectCanvasSize;
      const session = await driver.open(size, ratio);
      const root = new UIRoot();
      const button = new Button({ width: 144, height: 68, label: 'Start', textColor: new Color(0, 255, 0) });
      const face = new FontFace(
        `ExoWidgetFont${ratio}`,
        `url("${new URL('../../../examples/assets/fonts/font-kenney-future.ttf', import.meta.url)}")`,
      );

      const expectCenter = async (centerX: number, centerY: number): Promise<void> => {
        const frame = await session.draw(root, ctx);

        if (frame === null) {
          return;
        }

        let left = size;
        let top = size;
        let right = -1;
        let bottom = -1;

        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            if (frame[(y * size + x) * 4 + 1]! >= 128) {
              left = Math.min(left, x);
              top = Math.min(top, y);
              right = Math.max(right, x);
              bottom = Math.max(bottom, y);
            }
          }
        }

        expect(right).toBeGreaterThan(left);
        expect(bottom).toBeGreaterThan(top);
        // Pixel centers bracket the glyph's continuous extent at each edge.
        expect(Math.abs((left + right + 1) / (2 * ratio) - centerX)).toBeLessThanOrEqual(1);
        expect(Math.abs((top + bottom + 1) / (2 * ratio) - centerY)).toBeLessThanOrEqual(1);
      };

      try {
        root.addChild(button);
        button.setPosition(8, 8);
        await expectCenter(80, 42);

        button.label = 'New game\nPlay again';
        button.setSize(128, 94);
        button.setTextStyle({ fontSize: 20, fontFamily: 'Georgia', fontWeight: 'bold', fontStyle: 'italic', lineHeight: 1.6 });
        await expectCenter(72, 55);

        button.setTheme({ button: { normal: { insets: { left: 16, right: 4, top: 12, bottom: 4 } } } });
        await expectCenter(78, 59);

        button.label = 'WWW';
        button.labelNode.style.fontFamily = face;
        button.labelNode.style.fontWeight = 'normal';
        button.labelNode.style.fontStyle = 'normal';
        const fallback = button.labelNode.textBounds.width;
        expect(face.status).toBe('loading');
        await expectCenter(78, 59);

        await face.loaded;
        await expectCenter(78, 59);
        expect(button.labelNode.textBounds.width).not.toBe(fallback);

        for (const widget of [
          new Checkbox({ label: 'Checkbox' }),
          new Toggle({ label: 'Toggle' }),
          new Dropdown({ items: [{ label: 'Dropdown', value: 1 }], selectedIndex: 0 }),
        ]) {
          root.addChild(widget);
          const label = widget.children.find(node => node instanceof Text)!;
          label.style.fontSize = 26;
          await session.draw(root, ctx);
          const ink = label._fillBounds;
          expect(label.y + ink.y + ink.height / 2).toBeCloseTo(widget.uiHeight / 2);
          widget.destroy();
        }
      } finally {
        document.fonts.delete(face);
        root.destroy();
        session.close();
      }
    });
  });

  describe(`${backendName} shadow offset and blur are logical pixels`, () => {
    test.each(surfaceRatios)('the shadow overhangs the glyph by its offset at surface ratio %i', async surfaceRatio => {
      const session = await driver.open(effectCanvasSize, surfaceRatio);
      const rows: string[] = [];
      const failures: string[] = [];

      try {
        for (const offsetX of [2, 5]) {
          for (const scale of nodeScales) {
            const phaseMeans: number[] = [];

            for (const phase of phases) {
              const { root, text } = buildShadowScene({ offsetX, blur: 0, surfaceRatio, scale, phase });
              const frame = await session.draw(root, ctxProxy);

              text.destroy();

              if (frame === null) {
                return;
              }

              phaseMeans.push(measureShadowOverhang(frame, effectCanvasSize, { offsetX, surfaceRatio, scale }).mean);
            }

            const summary = summarize(phaseMeans, offsetX);
            const [maeLimit, p99Limit] = widthTolerance(surfaceRatio * scale, surfaceRatio);

            rows.push(
              `offset ${offsetX} s${scale}: mean ${summary.mean.toFixed(3)} MAE ${summary.mae.toFixed(3)}/${maeLimit.toFixed(3)} P99 ${summary.p99.toFixed(3)}/${p99Limit.toFixed(3)}`,
            );

            if (!judgeWidth(summary, offsetX, surfaceRatio * scale, surfaceRatio)) {
              failures.push(rows[rows.length - 1]!);
            }
          }
        }
      } finally {
        session.close();
        console.info(`[${backendName} shadow offset px, surface ratio ${surfaceRatio}]\n${rows.join('\n')}`);
      }

      expect(failures.join('\n')).toBe('');
    });

    // Drawn at 96 px so the stems are wider than the blur ramp: a smoothstep
    // across ±blur only reaches full strength where the shadowed shape is at
    // least `blur` deep, and a thin stem would cut the inner half of the ramp.
    test('the blur is the half-width of the shadow edge in logical pixels and keeps its 50 % point on the offset edge', async ctx => {
      const surfaceRatio = 2;
      const session = await driver.open(effectCanvasSize, surfaceRatio);
      const results: Array<{ key: string; blur: number; ramp: number; overhang: number }> = [];

      try {
        for (const scale of [1, 2]) {
          for (const blur of [1, 2]) {
            const { root, text } = buildShadowScene({
              offsetX: 3,
              blur,
              surfaceRatio,
              scale,
              sdfRadius: 8,
              phase: { fontSize: 96, deviceOffset: 0 },
            });
            const frame = await session.draw(root, ctx);

            text.destroy();

            if (frame === null) {
              return;
            }

            results.push({
              key: `blur ${blur} s${scale}`,
              blur,
              ramp: measureShadowRamp(frame, effectCanvasSize, { surfaceRatio, scale }),
              overhang: measureShadowOverhang(frame, effectCanvasSize, { offsetX: 3, surfaceRatio, scale }).mean,
            });
          }
        }
      } finally {
        session.close();
        console.info(`[${backendName} shadow blur, logical px]`, results);
      }

      // A smoothstep across ±blur rises 10 %→90 % over 1.216 × blur and keeps
      // its 50 % point on the offset edge, independent of the node scale.
      //
      // The absolute ramp also carries the distance field's own error: the
      // transform misplaces distances in the first raster pixel or so on either
      // side of an antialiased canvas edge, by an amount and sign that depend
      // on the platform's glyph rasterizer. That error does not depend on the
      // blur, so the growth from blur 1 to blur 2 isolates the semantics, and
      // the absolute width only has to stay within a one-raster-pixel
      // allowance in either direction.
      const byKey = new Map(results.map(result => [result.key, result]));

      for (const { key, blur, ramp, overhang } of results) {
        expect(overhang, `${key} 50 % point`).toBeGreaterThan(3 - 0.3);
        expect(overhang, `${key} 50 % point`).toBeLessThan(3 + 0.3);
        expect(ramp, `${key} ramp`).toBeGreaterThan(1.216 * blur - 0.35 - 1 / surfaceRatio);
        expect(ramp, `${key} ramp`).toBeLessThan(1.216 * blur + 0.35 + 1 / surfaceRatio);
      }

      for (const scale of [1, 2]) {
        const growth = byKey.get(`blur 2 s${scale}`)!.ramp - byKey.get(`blur 1 s${scale}`)!.ramp;

        expect(growth, `ramp growth per blur pixel at scale ${scale}`).toBeGreaterThan(1.216 - 0.3);
        expect(growth, `ramp growth per blur pixel at scale ${scale}`).toBeLessThan(1.216 + 0.3);
      }

      for (const blur of [1, 2]) {
        const spread = Math.abs(byKey.get(`blur ${blur} s1`)!.ramp - byKey.get(`blur ${blur} s2`)!.ramp);

        expect(spread, `blur ${blur} is independent of node scale`).toBeLessThan(0.3);
      }
    });
  });

  describe(`${backendName} colour glyphs`, () => {
    test('inactive shadow parameters leave the RGBA glyph pixel-identical', async ctx => {
      const session = await driver.open(effectCanvasSize, 1);

      try {
        // Colour glyphs keep the canvas's own ink: a letter that is not an
        // emoji rasterizes in the default black, so it is drawn over white.
        const build = (inactive: boolean): { root: Container; text: Text } => {
          const root = new Container();
          const backdrop = new Graphics();

          backdrop.fillColor = Color.white;
          backdrop.drawRectangle(0, 0, effectCanvasSize, effectCanvasSize);
          root.addChild(backdrop);

          const text = new Text('A', {
            colorGlyphs: true,
            fontSize: 48,
            fillColor: Color.white,
            ...(inactive && { shadowOffsetX: 6, shadowOffsetY: 4, shadowBlur: 3 }),
          });

          text.setPosition(20, 20);
          root.addChild(text);

          return { root, text };
        };

        const plain = build(false);
        const plainFrame = await session.draw(plain.root, ctx);

        plain.text.destroy();

        const styled = build(true);
        const styledFrame = await session.draw(styled.root, ctx);

        styled.text.destroy();

        if (plainFrame === null || styledFrame === null) {
          return;
        }

        let inked = 0;

        for (let i = 0; i < plainFrame.length; i += 4) {
          if (plainFrame[i]! < 128) {
            inked++;
          }
        }

        expect(inked).toBeGreaterThan(50);
        expect(frameDifference(plainFrame, styledFrame).max).toBe(0);
      } finally {
        session.close();
      }
    });

    test('an active outline or shadow on colour glyphs is rejected as no-distance-field', () => {
      expect(() => new Text('A', { colorGlyphs: true, outlineWidth: 1 })).toThrow(/no distance field/);
      expect(() => new Text('A', { colorGlyphs: true, shadowAlpha: 1 })).toThrow(/no distance field/);
    });
  });

  describe(`${backendName} neighbouring atlas content`, () => {
    // The decoration block is solid ink to its edge. A shadow sample that leaves
    // its own glyph tile by up to the full offset must still read empty field,
    // so the block keeps the same margin every glyph tile has.
    test('a shadow at full offset never picks up the decoration block packed next to its glyph', async ctx => {
      const surfaceRatio = 1;
      const session = await driver.open(effectCanvasSize, surfaceRatio);

      try {
        // Pack `I`, then the solid block right after it in the same shelf.
        const decorated = new Text('I', { fontFamily: 'sans-serif', fontSize: 40, sdfRadius: 8, underline: true });

        decorated.syncDirty();

        const atlas = getDefaultGlyphAtlasPool().getAtlas({ family: 'sans-serif', fontWeight: 'normal' }, 'sdf', 8, surfaceRatio);
        const solid = atlas.getSolidTexel();
        const glyph = atlas.getGlyph('I', 40);

        expect(solid.page).toBe(glyph.page);
        expect(solid.u).toBeGreaterThan(glyph.uvRight);

        const root = new Container();
        // Shadow to the left: the fragments sample to the RIGHT, towards the block.
        const text = new Text('I', {
          fontFamily: 'sans-serif',
          fontSize: 40,
          fillColor: new Color(0, 255, 0),
          shadowColor: new Color(0, 0, 255),
          shadowAlpha: 1,
          shadowOffsetX: -7,
          sdfRadius: 8,
        });

        text.setPosition(60, 20);
        root.addChild(text);

        const frame = await session.draw(root, ctx);

        text.destroy();
        decorated.destroy();

        if (frame === null) {
          return;
        }

        const fillColumns = litColumns(frame, effectCanvasSize, 1)!;
        const shadowColumns = litColumns(frame, effectCanvasSize, 2)!;

        expect(fillColumns).not.toBeNull();
        // The shadow is the glyph moved 7 px left: it may not reach right of the fill.
        expect(shadowColumns[1]).toBeLessThanOrEqual(fillColumns[1]);
        expect(shadowColumns[0]).toBeGreaterThanOrEqual(fillColumns[0] - 7 - 2);
      } finally {
        session.close();
      }
    });
  });
};

// The matrix tests open and draw many frames in one test body; a device loss
// in any of them skips the whole body rather than failing, as elsewhere.
const ctxProxy: SkipContext = {
  skip: (reason: string) => {
    throw new Error(`device lost mid-matrix: ${reason}`);
  },
};
