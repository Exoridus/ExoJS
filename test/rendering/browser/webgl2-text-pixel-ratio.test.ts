/**
 * WebGL2 browser tests for HiDPI runtime text - `Text.pixelRatio`.
 *
 * These need a REAL canvas: the whole cut is about what the glyph rasterizer
 * puts on the raster grid, and jsdom has neither `getImageData` nor real font
 * metrics. What is pinned here:
 *
 * 1. The raster grid grows with the ratio - bigger tiles, bigger SDF buffer.
 * 2. The LOGICAL layout does not move. Advances, wrapping, line breaks,
 *    `Text.measure` and the outline/shadow reach are identical at every ratio;
 *    only sharpness, tile size and memory change. This is the invariant the
 *    whole feature stands on, and it is the one a rasterization change could
 *    silently break.
 * 3. A node inherits the SURFACE's ratio through the backend it is drawn by,
 *    and an explicit override beats it.
 * 4. Cost and limits are measured rather than assumed - the memory table is
 *    printed, and the page-overflow diagnosis names the ratio that caused it.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { Color } from '#core/Color';
import type { RenderNode } from '#rendering/RenderNode';
import { GlyphAtlasPool, resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';
import type { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { createWebGl2TestBackend, readWebGl2Frame, renderWebGl2Once } from './_backendSetup';

const FAMILY = 'sans-serif';
const RATIOS = [1, 2, 3] as const;
const FONT_SIZES = [9, 11, 16, 24] as const;

/** Raster texel extent of a glyph's atlas slot, recovered from its UV rectangle. */
const rasterTile = (info: { uvLeft: number; uvRight: number; uvTop: number; uvBottom: number }, pageSize = 1024): { width: number; height: number } => ({
  width: Math.round((info.uvRight - info.uvLeft) * pageSize),
  height: Math.round((info.uvBottom - info.uvTop) * pageSize),
});

beforeEach(() => {
  // Every case wants a cold pool: an atlas is process-wide and would otherwise
  // hand the next test glyphs rasterized under the previous test's ratio.
  resetDefaultGlyphAtlasPool();
});

afterEach(() => {
  resetDefaultGlyphAtlasPool();
});

// ---------------------------------------------------------------------------
// Raster grid
// ---------------------------------------------------------------------------

describe('SDF rasterization at a pixel ratio', () => {
  test('rasterizes a bigger tile as the ratio rises', () => {
    const pool = new GlyphAtlasPool();
    const tiles = RATIOS.map(ratio => rasterTile(pool.getAtlas(FAMILY, 'normal', '400', 'sdf', 8, ratio).getGlyph('M', 16)));

    expect(tiles[1]!.width).toBeGreaterThan(tiles[0]!.width);
    expect(tiles[2]!.width).toBeGreaterThan(tiles[1]!.width);
    expect(tiles[1]!.height).toBeGreaterThan(tiles[0]!.height);
    expect(tiles[2]!.height).toBeGreaterThan(tiles[1]!.height);

    // Roughly linear in the ratio. Not exact: the glyph bounding box is ceiled
    // on the raster grid, so a few texels of quantisation ride along.
    expect(tiles[2]!.height / tiles[0]!.height).toBeGreaterThan(2.5);
    expect(tiles[2]!.height / tiles[0]!.height).toBeLessThan(3.5);
  });

  // The SDF buffer is the outline/shadow reach. It has to grow with the raster
  // grid, or the reach would shrink by exactly the ratio in logical units -
  // which is why the bearing (−buffer, normalized back) is ratio-invariant.
  test('scales the SDF buffer so the logical reach is unchanged', () => {
    const pool = new GlyphAtlasPool();

    for (const ratio of [1, 1.5, 2, 3]) {
      const info = pool.getAtlas(FAMILY, 'normal', '400', 'sdf', 8, ratio).getGlyph('M', 16);

      expect(info.xBearing, `ratio ${ratio}`).toBeCloseTo(-8, 6);
      expect(info.yBearing, `ratio ${ratio}`).toBeCloseTo(-8, 6);
    }
  });

  // The tile is the one number that CANNOT be ratio-invariant: its edges are
  // ceiled onto the raster grid, and a denser grid rounds differently. The
  // requirement is that it stays within a logical pixel, which is what keeps
  // the ink extent - and therefore culling and hit testing - stable.
  test('reports the tile in logical pixels, within a pixel of the ratio-1 tile', () => {
    const pool = new GlyphAtlasPool();
    const infos = RATIOS.map(ratio => pool.getAtlas(FAMILY, 'normal', '400', 'sdf', 8, ratio).getGlyph('M', 16));

    for (const info of infos) {
      expect(Math.abs(info.width - infos[0]!.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(info.height - infos[0]!.height)).toBeLessThanOrEqual(1);
    }
  });

  test('keeps the advance bit-identical across ratios', () => {
    const pool = new GlyphAtlasPool();

    for (const fontSize of FONT_SIZES) {
      const advances = RATIOS.map(ratio => pool.getAtlas(FAMILY, 'normal', '400', 'sdf', 8, ratio).getGlyph('M', fontSize).advance);

      expect(new Set(advances).size, `font size ${fontSize}: ${advances.join(', ')}`).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Atlas filtering
// ---------------------------------------------------------------------------

describe('the SDF atlas is sampled as a continuous field', () => {
  const size = 128;

  /**
   * How many distinct intensities the frame contains.
   *
   * This is the direct read of whether the distance field is being
   * reconstructed between texels. Sampled with NEAREST the field is piecewise
   * constant, so a magnified glyph resolves into blocks and the whole frame
   * collapses onto the handful of values its atlas texels happen to hold;
   * sampled linearly the same glyph produces a full ramp.
   */
  const intensityLevels = (frame: Uint8Array): number[] => {
    const seen = new Set<number>();

    for (let i = 0; i < frame.length; i += 4) {
      seen.add(frame[i]!);
    }

    return [...seen].sort((a, b) => a - b);
  };

  const distinctIntensities = (frame: Uint8Array): number => intensityLevels(frame).length;

  /**
   * The levels themselves plus the gaps between them, for a failure message.
   *
   * A short ramp says the field is being reconstructed at reduced precision,
   * and the gaps say by how much: an even spacing is a quantisation step and
   * names the format or qualifier that produced it, while an uneven one points
   * at the edge width instead. Without them a failure here reports only that
   * some adapter produced fewer levels than some other adapter, which no amount
   * of staring at the shader resolves.
   */
  const describeRamp = (frame: Uint8Array): string => {
    const levels = intensityLevels(frame);
    const gaps = levels.slice(1).map((level, index) => level - levels[index]!);

    return `levels (${levels.length}): [${levels.join(', ')}]\ngaps: [${gaps.join(', ')}]`;
  };

  test('pins the page sampler to linear filtering', () => {
    const pool = new GlyphAtlasPool();
    const sdf = pool.getAtlas(FAMILY, 'normal', '400', 'sdf');
    const color = pool.getAtlas(FAMILY, 'normal', '400', 'color');

    // ScaleModes.Linear === GL_LINEAR. A DataTexture defaults to NEAREST, which
    // is right for a lookup table and wrong for a distance field.
    expect(sdf.pages[0]!.texture.scaleMode).toBe(0x2601);
    expect(color.pages[0]!.texture.scaleMode).toBe(0x2601);
  });

  // A glyph magnified past its atlas density is the case every ratio mismatch
  // produces - a node scaled up at runtime, or a `pixelRatio` below the surface
  // it is drawn on. Under NEAREST this frame is a staircase.
  test('keeps a magnified glyph smooth rather than blocky', async () => {
    const backend = await createWebGl2TestBackend(size, 1);
    const node = new Text('O', { fontSize: 24, pixelRatio: 1, fillColor: new Color(255, 255, 255) });

    node.setPosition(20, 10);
    node.setScale(4);
    renderWebGl2Once(backend, node, Color.black);

    const frame = readWebGl2Frame(backend, size);
    const distinct = distinctIntensities(frame);
    const ramp = describeRamp(frame);

    node.destroy();
    backend.destroy();

    // Measured on this scene: 185 distinct intensities linearly filtered, 2 with
    // NEAREST. The two are that far apart because the sampler and the shader's
    // derivative-based edge width compound - a piecewise constant field has no
    // gradient inside a texel, so the fade it is entitled to collapses too and
    // the frame is left pure black and white.
    //
    // Asserted through the ramp rather than the count so a failure reports what
    // the frame actually contained: what a short ramp means is not decidable
    // from its length, and the adapters that produce one are exactly the ones
    // absent from the machine where the failure gets read.
    expect(distinct > 80 ? 'a full ramp' : ramp).toBe('a full ramp');
  });
});

// ---------------------------------------------------------------------------
// Logical layout invariance
// ---------------------------------------------------------------------------

describe('logical layout is independent of the raster density', () => {
  const sample = 'Hamburgefonstiv 0123 — wrap me here please';

  test.each(FONT_SIZES)('advance extent is identical at every ratio — %ppx', fontSize => {
    const bounds = RATIOS.map(pixelRatio => {
      const node = new Text(sample, { fontSize, pixelRatio });
      const measured = node.textBounds;

      node.destroy();

      return measured;
    });

    expect(bounds[1]).toEqual(bounds[0]);
    expect(bounds[2]).toEqual(bounds[0]);
  });

  test.each(FONT_SIZES)('wrapping, alignment and line count are identical at every ratio — %ppx', fontSize => {
    const options = { fontSize, maxWidth: fontSize * 8, align: 'center' as const, letterSpacing: 1.5, lineHeight: 1.4, leading: 3 };

    const laidOut = RATIOS.map(pixelRatio => {
      const node = new Text(sample, { ...options, pixelRatio });
      const quads = node.pageQuads.reduce((sum, page) => sum + page.quadCount, 0);
      // The top-left corner of every quad carries alignment, kerning,
      // letterSpacing and the wrap decision that produced the line it sits on -
      // comparing the whole list compares all of them at once. It is built from
      // the advance and the SDF bearing, both of which are exact, so this is an
      // exact comparison rather than a tolerant one.
      const origins = node.pageQuads.flatMap(page => [...page.vertices].filter((_, index) => index % 8 < 2));
      const extents = node.pageQuads.flatMap(page => [...page.vertices]);
      const bounds = node.textBounds;

      node.destroy();

      return { quads, origins, extents, bounds };
    });

    expect(laidOut[1]!.bounds).toEqual(laidOut[0]!.bounds);
    expect(laidOut[2]!.bounds).toEqual(laidOut[0]!.bounds);
    expect(laidOut[1]!.quads).toBe(laidOut[0]!.quads);
    expect(laidOut[2]!.quads).toBe(laidOut[0]!.quads);
    expect(laidOut[1]!.origins).toEqual(laidOut[0]!.origins);
    expect(laidOut[2]!.origins).toEqual(laidOut[0]!.origins);

    // The far corners additionally carry the tile size, which is quantised on
    // the raster grid: the glyph box is ceiled to whole raster texels on each
    // edge, and a coarse grid rounds up further than a fine one. Two logical
    // pixels is the arithmetic bound of that (one ceil per edge at ratio 1,
    // a third of one at ratio 3), and it lands on the ink extent only - never
    // on the advance, which is what layout is actually built from.
    for (const index of laidOut[0]!.extents.keys()) {
      expect(Math.abs(laidOut[2]!.extents[index]! - laidOut[0]!.extents[index]!), `vertex ${index}`).toBeLessThanOrEqual(2);
    }
  });

  // `Text.measure` has no application behind it, so it must answer out of the
  // ratio-free metrics - and still agree with every node, at every ratio.
  test.each(FONT_SIZES)('Text.measure agrees with a node at any ratio — %ppx', fontSize => {
    const measured = Text.measure(sample, { fontSize, maxWidth: fontSize * 8 });

    for (const pixelRatio of RATIOS) {
      const node = new Text(sample, { fontSize, maxWidth: fontSize * 8, pixelRatio });

      expect(node.textBounds, `ratio ${pixelRatio}`).toEqual(measured);

      node.destroy();
    }
  });

  test('a measurement answers without ever acquiring an atlas', () => {
    let atlasRequests = 0;

    class CountingPool extends GlyphAtlasPool {
      public override getAtlas(...args: Parameters<GlyphAtlasPool['getAtlas']>): ReturnType<GlyphAtlasPool['getAtlas']> {
        atlasRequests++;

        return super.getAtlas(...args);
      }
    }

    resetDefaultGlyphAtlasPool(new CountingPool());

    const measured = Text.measure('Nothing here has ever been drawn', { fontSize: 16 });

    // A real font behind a real measurement - and no atlas, no page, no glyph
    // rasterized to produce it.
    expect(measured.width).toBeGreaterThan(0);
    expect(atlasRequests).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Cost
// ---------------------------------------------------------------------------

describe('memory cost of a raised raster density', () => {
  // One representative screen of small UI text: the ASCII a label actually
  // draws, at the three sizes the iPhone probe compares.
  const GLYPHS = [...new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,:;!?()-/ ')];
  const PAGE_BYTES = 1024 * 1024; // R8, one byte per texel

  test('is measured rather than assumed to be the square of the ratio', () => {
    const rows = RATIOS.map(ratio => {
      const pool = new GlyphAtlasPool();
      const atlas = pool.getAtlas(FAMILY, 'normal', '400', 'sdf', 8, ratio);
      let tileTexels = 0;
      let largestTile = 0;

      for (const fontSize of [9, 11, 16]) {
        for (const char of GLYPHS) {
          const tile = rasterTile(atlas.getGlyph(char, fontSize));
          const area = tile.width * tile.height;

          tileTexels += area;
          largestTile = Math.max(largestTile, area);
        }
      }

      return {
        ratio,
        glyphs: GLYPHS.length * 3,
        tileTexels,
        meanTileTexels: Math.round(tileTexels / (GLYPHS.length * 3)),
        largestTile,
        pages: atlas.pages.length,
        r8Bytes: atlas.pages.length * PAGE_BYTES,
        uploadBytes: tileTexels,
      };
    });

    // The measurement IS the deliverable here - the numbers go into the report.
    console.log(`[text pixelRatio memory]\n${JSON.stringify(rows, null, 2)}`);

    expect(rows[1]!.tileTexels).toBeGreaterThan(rows[0]!.tileTexels);
    expect(rows[2]!.tileTexels).toBeGreaterThan(rows[1]!.tileTexels);

    // Bounded on both sides so the number stays honest: the SDF buffer is a
    // fixed logical width that also scales, so the growth sits near - but not
    // exactly on - the square of the ratio.
    const growth = rows[2]!.tileTexels / rows[0]!.tileTexels;

    expect(growth).toBeGreaterThan(4);
    expect(growth).toBeLessThan(9);
  });

  // A representability limit is a real answer, not a reason to clamp: the same
  // logical font size can fit a page at ratio 1 and overflow it at ratio 3, and
  // the message has to say which of the two numbers caused it.
  test('diagnoses a glyph that no longer fits a page, naming the ratio', () => {
    const pool = new GlyphAtlasPool();

    expect(() => pool.getAtlas(FAMILY, 'normal', '400', 'sdf', 8, 1).getGlyph('M', 400)).not.toThrow();
    expect(() => pool.getAtlas(FAMILY, 'normal', '400', 'sdf', 8, 3).getGlyph('M', 400)).toThrow(/pixelRatio 3/);
  });
});

// ---------------------------------------------------------------------------
// Inheritance through the backend
// ---------------------------------------------------------------------------

describe('a node inherits the surface it is drawn by', () => {
  const size = 128;

  const drawOnce = (backend: WebGl2Backend, node: RenderNode): void => renderWebGl2Once(backend, node, Color.black);

  test('takes the backend surface ratio when it has no override', async () => {
    const one = await createWebGl2TestBackend(size, 1);
    const three = await createWebGl2TestBackend(size, 3);
    const node = new Text('Inherit', { fontSize: 16 });

    drawOnce(one, node);
    expect(node.rasterPixelRatio).toBe(1);
    expect(node.atlas?.pixelRatio).toBe(1);

    // Same node, a different surface: it must move to that surface's atlas
    // rather than keep drawing from pages rasterized for the previous one.
    drawOnce(three, node);
    expect(node.rasterPixelRatio).toBe(3);
    expect(node.atlas?.pixelRatio).toBe(3);

    node.destroy();
    one.destroy();
    three.destroy();
  });

  test('keeps an explicit override on every surface', async () => {
    const one = await createWebGl2TestBackend(size, 1);
    const three = await createWebGl2TestBackend(size, 3);
    const node = new Text('Pinned', { fontSize: 16, pixelRatio: 2 });

    drawOnce(one, node);
    expect(node.atlas?.pixelRatio).toBe(2);

    drawOnce(three, node);
    expect(node.atlas?.pixelRatio).toBe(2);

    node.destroy();
    one.destroy();
    three.destroy();
  });

  test('two surfaces at different ratios do not depend on draw order', async () => {
    const two = await createWebGl2TestBackend(size, 2);
    const three = await createWebGl2TestBackend(size, 3);
    const a = new Text('A', { fontSize: 16 });
    const b = new Text('B', { fontSize: 16 });

    drawOnce(three, b);
    drawOnce(two, a);
    drawOnce(three, b);

    expect(a.atlas?.pixelRatio).toBe(2);
    expect(b.atlas?.pixelRatio).toBe(3);

    a.destroy();
    b.destroy();
    two.destroy();
    three.destroy();
  });
});

// ---------------------------------------------------------------------------
// Shadow reach
// ---------------------------------------------------------------------------

describe('style lengths stated in logical pixels', () => {
  const size = 128;

  /** Rightmost lit column of a rendered frame, or `null` when nothing was drawn. */
  const rightmostInk = (frame: Uint8Array): number | null => {
    for (let x = size - 1; x >= 0; x--) {
      for (let y = 0; y < size; y++) {
        if (frame[(y * size + x) * 4]! > 40) return x;
      }
    }

    return null;
  };

  // The shadow offset is authored in logical pixels but applied as an atlas-UV
  // shift, i.e. in TEXELS. Without scaling it by the raster density, raising a
  // node's `pixelRatio` would quietly shorten its shadow by exactly that factor
  // - a style change nobody asked for.
  //
  // Both runs draw on a ratio-1 SURFACE, so the device grid is identical and
  // only the glyph raster differs; the offset is then directly readable in
  // device pixels. It is kept under the SDF buffer (8px) because the shadow is
  // sampled inside the glyph's own quad and a longer offset would be clipped by
  // it rather than measured.
  test('a shadow reaches the same distance whatever the text raster density', async () => {
    const shadowOffsetX = 6;

    const measure = async (pixelRatio: number): Promise<number> => {
      const backend = await createWebGl2TestBackend(size, 1);

      const plain = new Text('H', { fontSize: 48, pixelRatio, fillColor: new Color(255, 255, 255) });

      plain.position.set(30, 20);
      renderWebGl2Once(backend, plain, Color.black);

      const glyphEdge = rightmostInk(readWebGl2Frame(backend, size));

      plain.destroy();

      // Same glyph, same place, plus a shadow. A black fill keeps the glyph
      // itself invisible against the black clear, so the only ink left in the
      // frame is the shadow - and its right edge is the reach being measured.
      const shadowed = new Text('H', {
        fontSize: 48,
        pixelRatio,
        fillColor: new Color(0, 0, 0),
        shadowColor: new Color(255, 255, 255),
        shadowAlpha: 1,
        shadowOffsetX,
      });

      shadowed.position.set(30, 20);
      renderWebGl2Once(backend, shadowed, Color.black);

      const shadowEdge = rightmostInk(readWebGl2Frame(backend, size));

      shadowed.destroy();
      backend.destroy();

      expect(glyphEdge).not.toBeNull();
      expect(shadowEdge).not.toBeNull();

      return shadowEdge! - glyphEdge!;
    };

    // A pixel of slack covers the SDF edge threshold landing on a different
    // texel; the bug this guards against would put the ratio-3 reach at 2px.
    expect(Math.abs((await measure(1)) - shadowOffsetX)).toBeLessThanOrEqual(1);
    expect(Math.abs((await measure(3)) - shadowOffsetX)).toBeLessThanOrEqual(1);
  });
});
