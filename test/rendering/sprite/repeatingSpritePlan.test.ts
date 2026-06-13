import {
  buildRepeatingSpriteQuads,
  computeShaderTiling,
  validateFit,
  validateMode,
  validateOffset,
  validateSizeInput,
} from '#rendering/sprite/repeatingSpritePlan';
import { TextureRegion } from '#rendering/texture/TextureRegion';

// ---------------------------------------------------------------------------
// Mock texture helper
// ---------------------------------------------------------------------------

const makeTex = (w = 128, h = 64) => ({ width: w, height: h, flipY: false }) as unknown as import('#rendering/texture/Texture').Texture;

const makeRegion = (w: number, h: number, x = 0, y = 0, tw?: number, th?: number) => {
  const tex = makeTex(tw ?? w + x + 4, th ?? h + y + 4);
  return new TextureRegion(tex, { x, y, width: w, height: h });
};

// ---------------------------------------------------------------------------
// validateSizeInput
// ---------------------------------------------------------------------------

describe('validateSizeInput', () => {
  test('accepts valid sizes', () => {
    expect(() => validateSizeInput(0, 0)).not.toThrow();
    expect(() => validateSizeInput(100, 200)).not.toThrow();
  });

  test('rejects negative width', () => {
    expect(() => validateSizeInput(-1, 10)).toThrow('non-negative');
  });

  test('rejects negative height', () => {
    expect(() => validateSizeInput(10, -1)).toThrow('non-negative');
  });

  test('rejects non-finite', () => {
    expect(() => validateSizeInput(Infinity, 10)).toThrow('finite');
    expect(() => validateSizeInput(10, NaN)).toThrow('finite');
  });
});

// ---------------------------------------------------------------------------
// validateMode
// ---------------------------------------------------------------------------

describe('validateMode', () => {
  test('accepts valid modes', () => {
    expect(() => validateMode('stretch', 'modeX')).not.toThrow();
    expect(() => validateMode('repeat', 'modeX')).not.toThrow();
    expect(() => validateMode('mirror-repeat', 'modeX')).not.toThrow();
  });

  test('rejects invalid strings', () => {
    expect(() => validateMode('tile', 'modeX')).toThrow('modeX');
    expect(() => validateMode(null, 'modeY')).toThrow('modeY');
    expect(() => validateMode(undefined, 'modeX')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// validateFit
// ---------------------------------------------------------------------------

describe('validateFit', () => {
  test('accepts valid fits', () => {
    expect(() => validateFit('clip', 'fitX')).not.toThrow();
    expect(() => validateFit('round', 'fitX')).not.toThrow();
  });

  test('rejects invalid', () => {
    expect(() => validateFit('stretch', 'fitX')).toThrow('fitX');
    expect(() => validateFit(0, 'fitY')).toThrow('fitY');
  });
});

// ---------------------------------------------------------------------------
// validateOffset
// ---------------------------------------------------------------------------

describe('validateOffset', () => {
  test('accepts finite values including negatives and zeros', () => {
    expect(() => validateOffset(0, 'offsetX')).not.toThrow();
    expect(() => validateOffset(-100, 'offsetX')).not.toThrow();
    expect(() => validateOffset(99999, 'offsetX')).not.toThrow();
  });

  test('rejects non-finite', () => {
    expect(() => validateOffset(Infinity, 'offsetX')).toThrow('finite');
    expect(() => validateOffset(NaN, 'offsetY')).toThrow('finite');
  });
});

// ---------------------------------------------------------------------------
// computeShaderTiling
// ---------------------------------------------------------------------------

describe('computeShaderTiling', () => {
  test('stretch always returns 1', () => {
    expect(computeShaderTiling(64, 300, 'stretch', 'clip')).toBe(1);
    expect(computeShaderTiling(64, 300, 'stretch', 'round')).toBe(1);
  });

  test('repeat + clip: exact ratio', () => {
    expect(computeShaderTiling(64, 128, 'repeat', 'clip')).toBe(2);
    expect(computeShaderTiling(64, 100, 'repeat', 'clip')).toBeCloseTo(100 / 64);
  });

  test('repeat + round: nearest integer', () => {
    expect(computeShaderTiling(64, 100, 'repeat', 'round')).toBe(2); // round(100/64) = 2
    expect(computeShaderTiling(64, 160, 'repeat', 'round')).toBe(3); // round(160/64) = 3 (2.5 rounds up)
    expect(computeShaderTiling(64, 130, 'repeat', 'round')).toBe(2); // round(130/64) = 2
  });

  test('mirror-repeat + clip: exact ratio', () => {
    expect(computeShaderTiling(64, 128, 'mirror-repeat', 'clip')).toBe(2);
  });

  test('returns at least 1 for very small destinations', () => {
    expect(computeShaderTiling(64, 1, 'repeat', 'round')).toBe(1);
  });

  test('returns 1 when source or dest is zero', () => {
    expect(computeShaderTiling(0, 100, 'repeat', 'clip')).toBe(1);
    expect(computeShaderTiling(64, 0, 'repeat', 'clip')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// buildRepeatingSpriteQuads — zero-size
// ---------------------------------------------------------------------------

describe('buildRepeatingSpriteQuads — zero size', () => {
  test('returns empty array for zero-width destination', () => {
    const r = makeRegion(64, 64);
    expect(buildRepeatingSpriteQuads(r, 0, 100, 'repeat', 'repeat', 'round', 'round', 0, 0)).toHaveLength(0);
  });

  test('returns empty array for zero-height destination', () => {
    const r = makeRegion(64, 64);
    expect(buildRepeatingSpriteQuads(r, 100, 0, 'repeat', 'repeat', 'round', 'round', 0, 0)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildRepeatingSpriteQuads — stretch
// ---------------------------------------------------------------------------

describe('buildRepeatingSpriteQuads — stretch', () => {
  test('stretch/stretch produces one quad covering full destination', () => {
    const r = makeRegion(64, 32);
    const quads = buildRepeatingSpriteQuads(r, 200, 100, 'stretch', 'stretch', 'clip', 'clip', 0, 0);
    expect(quads).toHaveLength(1);
    const q = quads[0];
    expect(q.x0).toBe(0);
    expect(q.y0).toBe(0);
    expect(q.x1).toBe(200);
    expect(q.y1).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// buildRepeatingSpriteQuads — repeat
// ---------------------------------------------------------------------------

describe('buildRepeatingSpriteQuads — repeat/round', () => {
  test('exact multiple produces correct count', () => {
    const r = makeRegion(64, 32);
    const quads = buildRepeatingSpriteQuads(r, 128, 96, 'repeat', 'repeat', 'round', 'round', 0, 0);
    // round(128/64)=2 × round(96/32)=3 = 6 quads
    expect(quads).toHaveLength(6);
  });

  test('no zero-area quads', () => {
    const r = makeRegion(64, 32);
    const quads = buildRepeatingSpriteQuads(r, 300, 200, 'repeat', 'repeat', 'round', 'round', 0, 0);
    for (const q of quads) {
      expect(q.x1 - q.x0).toBeGreaterThan(0);
      expect(q.y1 - q.y0).toBeGreaterThan(0);
    }
  });

  test('UVs stay within region bounds', () => {
    const r = makeRegion(64, 32);
    const quads = buildRepeatingSpriteQuads(r, 300, 200, 'repeat', 'repeat', 'round', 'round', 0, 0);
    for (const q of quads) {
      expect(q.u0).toBeGreaterThanOrEqual(r.u0 - 1e-6);
      expect(q.u1).toBeLessThanOrEqual(r.u1 + 1e-6);
      expect(q.v0).toBeGreaterThanOrEqual(r.v0 - 1e-6);
      expect(q.v1).toBeLessThanOrEqual(r.v1 + 1e-6);
    }
  });
});

describe('buildRepeatingSpriteQuads — repeat/clip', () => {
  test('partial final segment in X', () => {
    const r = makeRegion(64, 32);
    // dest=100, src=64, clip: segsX=ceil(100/64)=2 (partial last), segsY=1 exact
    const quads = buildRepeatingSpriteQuads(r, 100, 32, 'repeat', 'repeat', 'clip', 'clip', 0, 0);
    // X: 2 segs (64 + 36), Y: 1 seg (32)
    expect(quads).toHaveLength(2);
    // last quad covers only 36 pixels wide
    const lastX = quads[quads.length - 1];
    expect(lastX.x1 - lastX.x0).toBeCloseTo(36);
  });

  test('destination spans fill correctly to total width/height', () => {
    const r = makeRegion(16, 16);
    const quads = buildRepeatingSpriteQuads(r, 40, 40, 'repeat', 'repeat', 'clip', 'clip', 0, 0);
    // X: 3 segs, Y: 3 segs = 9 quads
    expect(quads).toHaveLength(9);
    // Verify they collectively cover [0, 40] × [0, 40]
    const xEnds = new Set(quads.map(q => Math.round(q.x1)));
    expect(xEnds.has(40)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildRepeatingSpriteQuads — mirror-repeat
// ---------------------------------------------------------------------------

describe('buildRepeatingSpriteQuads — mirror-repeat', () => {
  test('mirrored segments have sourceEnd < sourceStart', () => {
    const r = makeRegion(64, 32);
    const quads = buildRepeatingSpriteQuads(r, 256, 32, 'mirror-repeat', 'stretch', 'round', 'round', 0, 0);
    // round(256/64)=4 segs in X; odd ones are mirrored
    let mirrorCount = 0;
    for (const q of quads) {
      if (q.u1 < q.u0) mirrorCount++;
    }
    expect(mirrorCount).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// buildRepeatingSpriteQuads — atlas subregion UV range
// ---------------------------------------------------------------------------

describe('buildRepeatingSpriteQuads — atlas region UV', () => {
  test('UVs are within sub-region UV bounds', () => {
    const tex = makeTex(256, 256);
    // Region at (64,64) size 32×32 inside a 256×256 atlas
    const region = new TextureRegion(tex, { x: 64, y: 64, width: 32, height: 32 });
    const quads = buildRepeatingSpriteQuads(region, 100, 100, 'repeat', 'repeat', 'clip', 'clip', 0, 0);
    for (const q of quads) {
      expect(q.u0).toBeGreaterThanOrEqual(region.u0 - 1e-5);
      expect(q.u1).toBeLessThanOrEqual(region.u1 + 1e-5);
      expect(q.v0).toBeGreaterThanOrEqual(region.v0 - 1e-5);
      expect(q.v1).toBeLessThanOrEqual(region.v1 + 1e-5);
    }
  });

  test('extrusion shifts outer UV inward by zero', () => {
    const tex = makeTex(256, 256);
    const regionNoExt = new TextureRegion(tex, { x: 64, y: 64, width: 32, height: 32 });
    const regionWithExt = new TextureRegion(tex, { x: 64, y: 64, width: 32, height: 32, extrusion: 1 });
    const quadsNo = buildRepeatingSpriteQuads(regionNoExt, 32, 32, 'repeat', 'repeat', 'round', 'round', 0, 0);
    const quadsWith = buildRepeatingSpriteQuads(regionWithExt, 32, 32, 'repeat', 'repeat', 'round', 'round', 0, 0);
    // With extrusion, no half-texel inset on outer edges → UV touches region boundary
    // Without extrusion, half-texel inset shrinks the range slightly
    expect(quadsWith[0].u0).toBeCloseTo(regionWithExt.u0);
    expect(quadsNo[0].u0).toBeGreaterThan(regionNoExt.u0);
  });
});

// ---------------------------------------------------------------------------
// buildRepeatingSpriteQuads — offset
// ---------------------------------------------------------------------------

describe('buildRepeatingSpriteQuads — offset', () => {
  test('zero offset produces same result as no offset', () => {
    const r = makeRegion(64, 32);
    const a = buildRepeatingSpriteQuads(r, 200, 100, 'repeat', 'repeat', 'clip', 'clip', 0, 0);
    const b = buildRepeatingSpriteQuads(r, 200, 100, 'repeat', 'repeat', 'clip', 'clip', 0, 0);
    expect(a).toEqual(b);
  });

  test('positive offsetX shifts the pattern', () => {
    const r = makeRegion(64, 32);
    const withoutOffset = buildRepeatingSpriteQuads(r, 100, 32, 'repeat', 'stretch', 'clip', 'clip', 0, 0);
    const withOffset = buildRepeatingSpriteQuads(r, 100, 32, 'repeat', 'stretch', 'clip', 'clip', 10, 0);
    // The number of quads can change when offset splits a boundary
    expect(withOffset).not.toEqual(withoutOffset);
  });

  test('offset equal to source width equals zero offset (full period)', () => {
    const r = makeRegion(64, 32);
    const a = buildRepeatingSpriteQuads(r, 200, 100, 'repeat', 'repeat', 'clip', 'clip', 0, 0);
    const b = buildRepeatingSpriteQuads(r, 200, 100, 'repeat', 'repeat', 'clip', 'clip', 64, 0);
    // phase = (64 % 64 + 64) % 64 = 0 → same as no offset
    expect(a).toEqual(b);
  });

  test('negative offset resolves to positive phase', () => {
    const r = makeRegion(64, 32);
    // offset = -16 → phase = ((-16 % 64) + 64) % 64 = 48
    const negOffset = buildRepeatingSpriteQuads(r, 100, 32, 'repeat', 'stretch', 'clip', 'clip', -16, 0);
    const posPhase = buildRepeatingSpriteQuads(r, 100, 32, 'repeat', 'stretch', 'clip', 'clip', 48, 0);
    expect(negOffset).toEqual(posPhase);
  });

  test('stretch mode ignores offset', () => {
    const r = makeRegion(64, 32);
    const a = buildRepeatingSpriteQuads(r, 200, 100, 'stretch', 'stretch', 'clip', 'clip', 0, 0);
    const b = buildRepeatingSpriteQuads(r, 200, 100, 'stretch', 'stretch', 'clip', 'clip', 30, 0);
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// buildRepeatingSpriteQuads — destination coverage
// ---------------------------------------------------------------------------

describe('buildRepeatingSpriteQuads — destination coverage', () => {
  test('quads collectively fill the full destination width', () => {
    const r = makeRegion(16, 16);
    const quads = buildRepeatingSpriteQuads(r, 100, 16, 'repeat', 'stretch', 'clip', 'clip', 0, 0);
    const totalW = quads.reduce((sum, q) => sum + (q.x1 - q.x0), 0);
    expect(totalW).toBeCloseTo(100);
  });

  test('quads collectively fill the full destination height', () => {
    const r = makeRegion(16, 16);
    const quads = buildRepeatingSpriteQuads(r, 16, 100, 'stretch', 'repeat', 'clip', 'clip', 0, 0);
    const totalH = quads.reduce((sum, q) => sum + (q.y1 - q.y0), 0);
    expect(totalH).toBeCloseTo(100);
  });

  test('destination smaller than source clip mode: single quad', () => {
    const r = makeRegion(64, 64);
    const quads = buildRepeatingSpriteQuads(r, 32, 32, 'repeat', 'repeat', 'clip', 'clip', 0, 0);
    expect(quads).toHaveLength(1);
    expect(quads[0].x1).toBe(32);
  });
});
