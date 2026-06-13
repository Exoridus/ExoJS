import { buildNineSliceQuads, normalizeInsets, validateBorder, validateSlices } from '#rendering/sprite/nineSlice';
import type { Texture } from '#rendering/texture/Texture';
import { TextureRegion } from '#rendering/texture/TextureRegion';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeTexture = (w = 128, h = 64): Texture => ({ width: w, height: h, flipY: false, updateSource: () => undefined }) as unknown as Texture;

const makeRegion = (texture: Texture, x = 0, y = 0, width?: number, height?: number): TextureRegion =>
  new TextureRegion(texture, { x, y, width: width ?? texture.width, height: height ?? texture.height });

const makeRegionWithExtrusion = (texture: Texture, x: number, y: number, w: number, h: number, extrusion: number): TextureRegion =>
  new TextureRegion(texture, { x, y, width: w, height: h, extrusion });

// ---------------------------------------------------------------------------
// validateSlices
// ---------------------------------------------------------------------------

describe('validateSlices', () => {
  test('accepts valid slices', () => {
    expect(() => validateSlices({ left: 10, top: 10, right: 10, bottom: 10 }, 64, 64)).not.toThrow();
  });

  test('rejects NaN left', () => {
    expect(() => validateSlices({ left: NaN, top: 0, right: 0, bottom: 0 }, 64, 64)).toThrow(/finite/);
  });

  test('rejects Infinity right', () => {
    expect(() => validateSlices({ left: 0, top: 0, right: Infinity, bottom: 0 }, 64, 64)).toThrow(/finite/);
  });

  test('rejects -Infinity top', () => {
    expect(() => validateSlices({ left: 0, top: -Infinity, right: 0, bottom: 0 }, 64, 64)).toThrow(/finite/);
  });

  test('rejects negative left', () => {
    expect(() => validateSlices({ left: -1, top: 0, right: 0, bottom: 0 }, 64, 64)).toThrow(/non-negative/);
  });

  test('rejects negative bottom', () => {
    expect(() => validateSlices({ left: 0, top: 0, right: 0, bottom: -0.1 }, 64, 64)).toThrow(/non-negative/);
  });

  test('rejects horizontal overflow', () => {
    expect(() => validateSlices({ left: 40, top: 0, right: 30, bottom: 0 }, 64, 64)).toThrow(/exceeds region width/);
  });

  test('rejects vertical overflow', () => {
    expect(() => validateSlices({ left: 0, top: 40, right: 0, bottom: 30 }, 64, 64)).toThrow(/exceeds region height/);
  });

  test('accepts slices equal to region dimensions (zero center)', () => {
    expect(() => validateSlices({ left: 32, top: 32, right: 32, bottom: 32 }, 64, 64)).not.toThrow();
  });

  test('accepts zero slices', () => {
    expect(() => validateSlices({ left: 0, top: 0, right: 0, bottom: 0 }, 64, 64)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// validateBorder
// ---------------------------------------------------------------------------

describe('validateBorder', () => {
  test('accepts valid borders', () => {
    expect(() => validateBorder({ left: 10, top: 10, right: 10, bottom: 10 })).not.toThrow();
  });

  test('accepts zero borders', () => {
    expect(() => validateBorder({ left: 0, top: 0, right: 0, bottom: 0 })).not.toThrow();
  });

  test('rejects negative border', () => {
    expect(() => validateBorder({ left: -1, top: 0, right: 0, bottom: 0 })).toThrow(/non-negative/);
  });

  test('rejects NaN border', () => {
    expect(() => validateBorder({ left: NaN, top: 0, right: 0, bottom: 0 })).toThrow(/finite/);
  });

  test('rejects Infinity border', () => {
    expect(() => validateBorder({ left: Infinity, top: 0, right: 0, bottom: 0 })).toThrow(/finite/);
  });
});

// ---------------------------------------------------------------------------
// normalizeInsets
// ---------------------------------------------------------------------------

describe('normalizeInsets', () => {
  test('number input produces uniform frozen insets', () => {
    const result = normalizeInsets(8);
    expect(result).toEqual({ left: 8, top: 8, right: 8, bottom: 8 });
    expect(Object.isFrozen(result)).toBe(true);
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

  test('result is frozen', () => {
    const result = normalizeInsets({ left: 1, top: 2, right: 3, bottom: 4 });
    expect(() => {
      (result as Record<string, number>).left = 99;
    }).toThrow();
  });
});

// ---------------------------------------------------------------------------
// buildNineSliceQuads — all-stretch (default)
// ---------------------------------------------------------------------------

describe('buildNineSliceQuads — all-stretch (default)', () => {
  test('produces 9 quads for a simple case', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex);
    const slices = { left: 10, top: 10, right: 10, bottom: 10 };
    const border = { left: 10, top: 10, right: 10, bottom: 10 };
    const quads = buildNineSliceQuads(region, slices, border, 100, 100, undefined);
    expect(quads.length).toBe(9);
  });

  test('corner UV quads use correct UV quadrants', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex);
    const slices = { left: 16, top: 16, right: 16, bottom: 16 };
    const border = { left: 16, top: 16, right: 16, bottom: 16 };
    const quads = buildNineSliceQuads(region, slices, border, 64, 64, undefined);

    // TL corner: with no extrusion, outer UVs are half-texel inset
    const halfU = 0.5 / 64;
    const halfV = 0.5 / 64;
    const tl = quads[0];
    expect(tl.x0).toBe(0);
    expect(tl.y0).toBe(0);
    expect(tl.x1).toBeCloseTo(16);
    expect(tl.y1).toBeCloseTo(16);
    expect(tl.u0).toBeCloseTo(halfU);
    expect(tl.v0).toBeCloseTo(halfV);
    expect(tl.u1).toBeCloseTo(16 / 64 - halfU);
    expect(tl.v1).toBeCloseTo(16 / 64 - halfV);

    // TR corner
    const tr = quads[1];
    expect(tr.x0).toBeCloseTo(48);
    expect(tr.y0).toBe(0);
    expect(tr.x1).toBeCloseTo(64);
    expect(tr.y1).toBeCloseTo(16);
    expect(tr.u0).toBeCloseTo(48 / 64 + halfU);
    expect(tr.u1).toBeCloseTo(1 - halfU);
  });

  test('border defaults to slices (stretch center)', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex);
    const slices = { left: 8, top: 8, right: 8, bottom: 8 };
    const quads = buildNineSliceQuads(region, slices, slices, 128, 128, undefined);
    expect(quads.length).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// buildNineSliceQuads — UV boundaries
// ---------------------------------------------------------------------------

describe('buildNineSliceQuads — UV boundaries', () => {
  test('exact asymmetric slice boundaries', () => {
    const tex = makeTexture(100, 80);
    const region = makeRegion(tex);
    const slices = { left: 10, top: 20, right: 30, bottom: 40 };
    const border = { left: 5, top: 10, right: 15, bottom: 20 };
    const quads = buildNineSliceQuads(region, slices, border, 80, 60, undefined);

    // TL corner: half-texel inset applied to outer UVs
    const halfU = 0.5 / 100;
    const halfV = 0.5 / 80;
    const tl = quads[0];
    expect(tl.u0).toBeCloseTo(halfU, 7);
    expect(tl.u1).toBeCloseTo(10 / 100 - halfU, 7);
    expect(tl.v0).toBeCloseTo(halfV, 7);
    expect(tl.v1).toBeCloseTo(20 / 80 - halfV, 7);

    // BR corner: inner boundary UVs have half-texel inset from slice edges
    const br = quads[3];
    // Inner U boundary: uRightBound = (100-30)/100 = 0.7, plus 0.5/100 inset = 0.705
    expect(br.u0).toBeCloseTo((100 - 30) / 100 + 0.5 / 100, 5);
    // Inner V boundary: vBottomBound = (80-40)/80 = 0.5, plus 0.5/80 inset = 0.50625
    expect(br.v0).toBeCloseTo((80 - 40) / 80 + 0.5 / 80, 5);
    // Outer bounds: half-texel inset from region edge
    expect(br.u1).toBeCloseTo(1 - 0.5 / 100, 5);
    expect(br.v1).toBeCloseTo(1 - 0.5 / 80, 5);
  });

  test('all quad UV values are in [0, 1] range', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex);
    const slices = { left: 10, top: 10, right: 10, bottom: 10 };
    const border = { left: 10, top: 10, right: 10, bottom: 10 };
    const quads = buildNineSliceQuads(region, slices, border, 100, 100, undefined);
    for (const q of quads) {
      expect(q.u0).toBeGreaterThanOrEqual(-1e-9);
      expect(q.u1).toBeLessThanOrEqual(1 + 1e-9);
      expect(q.v0).toBeGreaterThanOrEqual(-1e-9);
      expect(q.v1).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  test('UVs never invert', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex);
    const slices = { left: 10, top: 10, right: 10, bottom: 10 };
    const border = { left: 10, top: 10, right: 10, bottom: 10 };
    const quads = buildNineSliceQuads(region, slices, border, 100, 100, undefined);
    for (const q of quads) {
      expect(q.u0).toBeLessThanOrEqual(q.u1);
      expect(q.v0).toBeLessThanOrEqual(q.v1);
    }
  });

  test('atlas subregion with non-zero origin has correct UVs', () => {
    const tex = makeTexture(256, 256);
    const region = makeRegion(tex, 32, 32, 64, 64);
    const slices = { left: 10, top: 10, right: 10, bottom: 10 };
    const border = { left: 10, top: 10, right: 10, bottom: 10 };
    const quads = buildNineSliceQuads(region, slices, border, 100, 100, undefined);

    // region x=32, y=32, w=64, h=64 on 256x256 texture
    // u0 = 32/256=0.125, v0 = 32/256=0.125
    // With half-texel inset: u0 = 0.125 + 0.5/256 = 0.125 + ~0.00195
    const halfU = 0.5 / 256;
    const tl = quads[0];
    expect(tl.u0).toBeCloseTo(32 / 256 + halfU, 6);
    expect(tl.v0).toBeCloseTo(32 / 256 + halfU, 6);

    const br = quads[3];
    expect(br.u1).toBeCloseTo(96 / 256 - halfU, 6);
    expect(br.v1).toBeCloseTo(96 / 256 - halfU, 6);
  });

  test('extrusion present: outer UVs use full region range', () => {
    const tex = makeTexture(128, 128);
    // Region at (32,32) size 64x64 with extrusion=2 on all sides
    const region = makeRegionWithExtrusion(tex, 32, 32, 64, 64, 2);
    const slices = { left: 10, top: 10, right: 10, bottom: 10 };
    const border = { left: 10, top: 10, right: 10, bottom: 10 };
    const quads = buildNineSliceQuads(region, slices, border, 64, 64, undefined);

    // With extrusion, outer UVs should not be inset by half-texel
    const tl = quads[0];
    expect(tl.u0).toBe(region.u0);
    expect(tl.v0).toBe(region.v0);

    const br = quads[3];
    expect(br.u1).toBe(region.u1);
    expect(br.v1).toBe(region.v1);
  });

  test('no extrusion: outer UVs are half-texel inset', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex);
    const slices = { left: 10, top: 10, right: 10, bottom: 10 };
    const border = { left: 10, top: 10, right: 10, bottom: 10 };
    const quads = buildNineSliceQuads(region, slices, border, 64, 64, undefined);

    const halfU = 0.5 / 64;
    const halfV = 0.5 / 64;
    const tl = quads[0];
    expect(tl.u0).toBe(region.u0 + halfU);
    expect(tl.v0).toBe(region.v0 + halfV);

    const br = quads[3];
    expect(br.u1).toBe(region.u1 - halfU);
    expect(br.v1).toBe(region.v1 - halfV);
  });

  test('1-pixel corner region does not produce inverted UVs', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex, 0, 0, 1, 1);
    const slices = { left: 0, top: 0, right: 0, bottom: 0 };
    const border = { left: 5, top: 5, right: 5, bottom: 5 };
    const quads = buildNineSliceQuads(region, slices, border, 20, 20, undefined);
    for (const q of quads) {
      expect(q.u0).toBeLessThanOrEqual(q.u1);
      expect(q.v0).toBeLessThanOrEqual(q.v1);
    }
  });
});

// ---------------------------------------------------------------------------
// buildNineSliceQuads — zero-center
// ---------------------------------------------------------------------------

describe('buildNineSliceQuads — zero-center', () => {
  test('slices fill entire region width: no center or horizontal edges', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex);
    const slices = { left: 32, top: 10, right: 32, bottom: 10 };
    const border = { left: 32, top: 10, right: 32, bottom: 10 };
    const quads = buildNineSliceQuads(region, slices, border, 64, 64, undefined);
    // 4 corners + 2 vertical edges
    expect(quads.length).toBe(6);
    for (const q of quads) {
      expect(q.x1 - q.x0).toBeGreaterThan(0);
    }
  });

  test('zero-size slices produce only corners (no edges/center)', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex);
    // left+right = 64, top+bottom = 64 → zero center in both axes
    const slices = { left: 32, top: 32, right: 32, bottom: 32 };
    const border = { left: 32, top: 32, right: 32, bottom: 32 };
    const quads = buildNineSliceQuads(region, slices, border, 64, 64, undefined);
    // Only 4 corners
    expect(quads.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// buildNineSliceQuads — small-target compression
// ---------------------------------------------------------------------------

describe('buildNineSliceQuads — small-target compression', () => {
  test('borders compressed when width < bl + br', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex);
    const slices = { left: 16, top: 16, right: 16, bottom: 16 };
    const border = { left: 30, top: 16, right: 30, bottom: 16 };
    const quads = buildNineSliceQuads(region, slices, border, 50, 50, undefined);
    for (const q of quads) {
      expect(q.x0).toBeGreaterThanOrEqual(0);
      expect(q.x1).toBeLessThanOrEqual(50 + 1e-9);
      expect(q.y0).toBeGreaterThanOrEqual(0);
      expect(q.y1).toBeLessThanOrEqual(50 + 1e-9);
    }
  });

  test('both axes compressed', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex);
    const slices = { left: 16, top: 16, right: 16, bottom: 16 };
    const border = { left: 30, top: 30, right: 30, bottom: 30 };
    const quads = buildNineSliceQuads(region, slices, border, 20, 20, undefined);
    // All quads fit within [0,20]x[0,20] — only corners
    for (const q of quads) {
      expect(q.x0).toBeGreaterThanOrEqual(0);
      expect(q.x1).toBeLessThanOrEqual(20 + 1e-9);
      expect(q.y0).toBeGreaterThanOrEqual(0);
      expect(q.y1).toBeLessThanOrEqual(20 + 1e-9);
    }
  });

  test('center collapses to zero when borders fill entire width', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex);
    const slices = { left: 10, top: 10, right: 10, bottom: 10 };
    // border exceeds width
    const border = { left: 30, top: 30, right: 30, bottom: 30 };
    const quads = buildNineSliceQuads(region, slices, border, 40, 40, undefined);
    // No center quads possible
    const centerQuads = quads.filter(q => q.x0 > 0 && q.x1 < 40 && q.y0 > 0 && q.y1 < 40);
    expect(centerQuads.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildNineSliceQuads — repeat mode
// ---------------------------------------------------------------------------

describe('buildNineSliceQuads — repeat mode', () => {
  test('repeat mode produces more than 1 quad for top edge when span > nativeTileW', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex);
    const slices = { left: 10, top: 10, right: 10, bottom: 10 };
    const border = { left: 10, top: 10, right: 10, bottom: 10 };
    const quads = buildNineSliceQuads(region, slices, border, 200, 200, { edges: 'repeat', edgeFit: 'round' });
    const topEdgeQuads = quads.filter(q => q.y0 === 0 && Math.abs(q.y1 - 10) < 1e-6 && q.x0 > 0 && q.x1 < 190);
    expect(topEdgeQuads.length).toBeGreaterThan(1);
  });

  test('clip fit produces final partial segment', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex);
    const slices = { left: 10, top: 10, right: 10, bottom: 10 };
    const border = { left: 10, top: 10, right: 10, bottom: 10 };
    const quads = buildNineSliceQuads(region, slices, border, 200, 200, { edges: 'repeat', edgeFit: 'clip' });
    expect(quads.length).toBeGreaterThan(9);
  });

  test('differing edge and center fit values', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex);
    const slices = { left: 10, top: 10, right: 10, bottom: 10 };
    const border = { left: 10, top: 10, right: 10, bottom: 10 };
    const quads = buildNineSliceQuads(region, slices, border, 200, 200, {
      edges: 'repeat',
      center: 'repeat',
      edgeFit: 'clip',
      centerFit: 'round',
    });
    // Both edges and center should produce multiple quads
    expect(quads.length).toBeGreaterThan(9);
  });
});

// ---------------------------------------------------------------------------
// buildNineSliceQuads — zero size
// ---------------------------------------------------------------------------

describe('buildNineSliceQuads — zero size', () => {
  test('width zero produces no quads', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex);
    const slices = { left: 10, top: 10, right: 10, bottom: 10 };
    const border = { left: 10, top: 10, right: 10, bottom: 10 };
    const quads = buildNineSliceQuads(region, slices, border, 0, 100, undefined);
    expect(quads.length).toBe(0);
  });

  test('height zero produces no quads', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex);
    const slices = { left: 10, top: 10, right: 10, bottom: 10 };
    const border = { left: 10, top: 10, right: 10, bottom: 10 };
    const quads = buildNineSliceQuads(region, slices, border, 100, 0, undefined);
    expect(quads.length).toBe(0);
  });

  test('both dimensions zero produces no quads', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex);
    const slices = { left: 10, top: 10, right: 10, bottom: 10 };
    const border = { left: 10, top: 10, right: 10, bottom: 10 };
    const quads = buildNineSliceQuads(region, slices, border, 0, 0, undefined);
    expect(quads.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildNineSliceQuads — mirror-repeat
// ---------------------------------------------------------------------------

describe('buildNineSliceQuads — mirror-repeat', () => {
  test('mirror-repeat edges produce alternating quads', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex);
    const slices = { left: 10, top: 10, right: 10, bottom: 10 };
    const border = { left: 10, top: 10, right: 10, bottom: 10 };
    const quads = buildNineSliceQuads(region, slices, border, 300, 100, { edges: 'mirror-repeat', edgeFit: 'round' });
    expect(quads.length).toBeGreaterThan(9);
  });
});

// ---------------------------------------------------------------------------
// buildNineSliceQuads — per-edge mode overrides
// ---------------------------------------------------------------------------

describe('buildNineSliceQuads — per-edge mode overrides', () => {
  test('per-edge overrides take precedence over edges', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex);
    const slices = { left: 10, top: 10, right: 10, bottom: 10 };
    const border = { left: 10, top: 10, right: 10, bottom: 10 };
    // edges = 'repeat' but top is overridden to 'stretch'
    const quads = buildNineSliceQuads(region, slices, border, 200, 100, {
      edges: 'repeat',
      top: 'stretch',
      edgeFit: 'round',
    });
    // Top should have exactly 1 quad (stretch), bottom should have multiple (repeat)
    // Top edge with 'stretch' override: should produce exactly 1 quad.
    // Edge is between dx1=10 and dx2=190. Corners are at x0=0,x1=10 (TL) and x0=190,x1=200 (TR).
    const topQuads = quads.filter(
      q =>
        q.y0 === 0 &&
        Math.abs(q.y1 - 10) < 1e-6 &&
        q.x0 > 0 &&
        q.x1 < 200 &&
        !(Math.abs(q.x0 - 0) < 1e-6 && Math.abs(q.x1 - 10) < 1e-6) && // not TL
        !(Math.abs(q.x0 - 190) < 1e-6 && Math.abs(q.x1 - 200) < 1e-6), // not TR
    );
    const bottomQuads = quads.filter(
      q =>
        Math.abs(q.y0 - 90) < 1e-6 &&
        Math.abs(q.y1 - 100) < 1e-6 &&
        q.x0 > 0 &&
        q.x1 < 200 &&
        !(Math.abs(q.x0 - 0) < 1e-6 && Math.abs(q.x1 - 10) < 1e-6) && // not BL
        !(Math.abs(q.x0 - 190) < 1e-6 && Math.abs(q.x1 - 200) < 1e-6), // not BR
    );
    expect(topQuads.length).toBe(1);
    expect(bottomQuads.length).toBeGreaterThan(1);
  });
});
