import { buildNineSliceQuads, normalizeInsets } from '#rendering/sprite/nineSlice';
import type { Texture } from '#rendering/texture/Texture';
import { TextureRegion } from '#rendering/texture/TextureRegion';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeTexture = (w = 128, h = 64): Texture =>
  ({ width: w, height: h, flipY: false, updateSource: () => undefined }) as unknown as Texture;

const makeRegion = (texture: Texture, x = 0, y = 0, width?: number, height?: number): TextureRegion =>
  new TextureRegion(texture, { x, y, width: width ?? texture.width, height: height ?? texture.height });

// ---------------------------------------------------------------------------
// normalizeInsets
// ---------------------------------------------------------------------------

describe('normalizeInsets', () => {
  test('number input produces uniform insets', () => {
    const result = normalizeInsets(8);
    expect(result).toEqual({ left: 8, top: 8, right: 8, bottom: 8 });
  });

  test('partial object fills missing sides with 0', () => {
    const result = normalizeInsets({ left: 4, top: 6 });
    expect(result).toEqual({ left: 4, top: 6, right: 0, bottom: 0 });
  });

  test('partial object uses fallback for missing sides', () => {
    const fallback = { left: 10, top: 10, right: 10, bottom: 10 };
    const result = normalizeInsets({ left: 4 }, fallback);
    expect(result).toEqual({ left: 4, top: 10, right: 10, bottom: 10 });
  });

  test('full object passes through unchanged', () => {
    const result = normalizeInsets({ left: 1, top: 2, right: 3, bottom: 4 });
    expect(result).toEqual({ left: 1, top: 2, right: 3, bottom: 4 });
  });
});

// ---------------------------------------------------------------------------
// buildNineSliceQuads
// ---------------------------------------------------------------------------

describe('buildNineSliceQuads — all-stretch (default)', () => {
  test('produces 9 quads for a simple case', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex);
    const slices = { left: 10, top: 10, right: 10, bottom: 10 };
    const border = { left: 10, top: 10, right: 10, bottom: 10 };
    const quads = buildNineSliceQuads(region, slices, border, 100, 100, undefined, 0);
    // 4 corners + 4 edges (stretch = 1 quad each) + 1 center
    expect(quads.length).toBe(9);
  });

  test('corner UV quads use correct UV quadrants', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex);
    const slices = { left: 16, top: 16, right: 16, bottom: 16 };
    const border = { left: 16, top: 16, right: 16, bottom: 16 };
    const quads = buildNineSliceQuads(region, slices, border, 64, 64, undefined, 0);

    // TL corner
    const tl = quads[0];
    expect(tl.x0).toBe(0);
    expect(tl.y0).toBe(0);
    expect(tl.x1).toBeCloseTo(16);
    expect(tl.y1).toBeCloseTo(16);
    expect(tl.u0).toBeCloseTo(0);
    expect(tl.v0).toBeCloseTo(0);
    expect(tl.u1).toBeCloseTo(16 / 64);
    expect(tl.v1).toBeCloseTo(16 / 64);

    // TR corner
    const tr = quads[1];
    expect(tr.x0).toBeCloseTo(48);
    expect(tr.y0).toBe(0);
    expect(tr.x1).toBeCloseTo(64);
    expect(tr.y1).toBeCloseTo(16);
    expect(tr.u0).toBeCloseTo(48 / 64);
    expect(tr.u1).toBeCloseTo(1);
  });

  test('bleed shrinks outer UV bounds', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex);
    const slices = { left: 10, top: 10, right: 10, bottom: 10 };
    const border = { left: 10, top: 10, right: 10, bottom: 10 };
    const bleed = 0.5;
    const quads = buildNineSliceQuads(region, slices, border, 100, 100, undefined, bleed);

    // TL corner u0 should be offset by bleed
    const tl = quads[0];
    expect(tl.u0).toBeCloseTo(0.5 / 64, 6);
    expect(tl.v0).toBeCloseTo(0.5 / 64, 6);
  });

  test('border defaults to slices (stretch center)', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex);
    const slices = { left: 8, top: 8, right: 8, bottom: 8 };
    const quads = buildNineSliceQuads(region, slices, slices, 128, 128, undefined, 0);
    expect(quads.length).toBe(9);
  });
});

describe('buildNineSliceQuads — zero-center', () => {
  test('slices fill entire region width: no center or horizontal edges', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex);
    // slices cover full width — no center column
    const slices = { left: 32, top: 10, right: 32, bottom: 10 };
    const border = { left: 32, top: 10, right: 32, bottom: 10 };
    const quads = buildNineSliceQuads(region, slices, border, 64, 64, undefined, 0);
    // No center W → no top/bottom edges, no center
    // Only 4 corners + 2 vertical edges
    for (const q of quads) {
      // no quad should span the center column
      expect(q.x1 - q.x0).toBeGreaterThan(0);
    }
    // corners only (centerW = 0 means no top/bottom edges, no center)
    expect(quads.length).toBe(4 + 2); // 4 corners + left + right edges
  });
});

describe('buildNineSliceQuads — small-target compression', () => {
  test('borders compressed when width < bl + br', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex);
    const slices = { left: 16, top: 16, right: 16, bottom: 16 };
    // border is 30 + 30 = 60 > width = 50
    const border = { left: 30, top: 16, right: 30, bottom: 16 };
    // Should not throw, should compress
    const quads = buildNineSliceQuads(region, slices, border, 50, 50, undefined, 0);
    // All quads must fit within [0, 50] x [0, 50]
    for (const q of quads) {
      expect(q.x0).toBeGreaterThanOrEqual(0);
      expect(q.x1).toBeLessThanOrEqual(50 + 1e-9);
      expect(q.y0).toBeGreaterThanOrEqual(0);
      expect(q.y1).toBeLessThanOrEqual(50 + 1e-9);
    }
  });
});

describe('buildNineSliceQuads — repeat mode', () => {
  test('repeat mode produces more than 1 quad for top edge when span > nativeTileW', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex);
    const slices = { left: 10, top: 10, right: 10, bottom: 10 };
    const border = { left: 10, top: 10, right: 10, bottom: 10 };
    // width = 200 → centerW = 180, srcEdgeW = 44
    // topNativeW = srcEdgeW * (bt / slices.top) = 44 * (10/10) = 44
    // round(180/44) ≈ 4 tiles
    const quads = buildNineSliceQuads(region, slices, border, 200, 200, { edges: 'repeat', fit: 'round' }, 0);

    // Count top-edge quads: y0 == 0, y1 == 10 (dy1), x0 > 0
    const topEdgeQuads = quads.filter(q => q.y0 === 0 && Math.abs(q.y1 - 10) < 1e-6 && q.x0 > 0 && q.x1 < 190);
    expect(topEdgeQuads.length).toBeGreaterThan(1);
  });
});

describe('buildNineSliceQuads — UV consistency', () => {
  test('all quad UV values are in [0, 1] range (no bleed)', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex);
    const slices = { left: 10, top: 10, right: 10, bottom: 10 };
    const border = { left: 10, top: 10, right: 10, bottom: 10 };
    const quads = buildNineSliceQuads(region, slices, border, 100, 100, undefined, 0);
    for (const q of quads) {
      expect(q.u0).toBeGreaterThanOrEqual(-1e-9);
      expect(q.u1).toBeLessThanOrEqual(1 + 1e-9);
      expect(q.v0).toBeGreaterThanOrEqual(-1e-9);
      expect(q.v1).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});
