import type { Texture } from '#rendering/texture/Texture';
import { TextureRegion, type TextureRegionInsets } from '#rendering/texture/TextureRegion';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeTexture = (w = 128, h = 64): Texture => ({ width: w, height: h, flipY: false, updateSource: () => undefined }) as unknown as Texture;

const makeRegion = (texture: Texture, x = 0, y = 0, width?: number, height?: number, extrusion?: number | TextureRegionInsets): TextureRegion =>
  new TextureRegion(texture, {
    x,
    y,
    width: width ?? texture.width,
    height: height ?? texture.height,
    extrusion,
  });

// ---------------------------------------------------------------------------
// Construction & basic properties
// ---------------------------------------------------------------------------

describe('TextureRegion — construction', () => {
  test('full-texture region', () => {
    const tex = makeTexture(256, 128);
    const region = makeRegion(tex);
    expect(region.x).toBe(0);
    expect(region.y).toBe(0);
    expect(region.width).toBe(256);
    expect(region.height).toBe(128);
    expect(region.texture).toBe(tex);
  });

  test('sub-region coordinates', () => {
    const tex = makeTexture(256, 128);
    const region = makeRegion(tex, 32, 16, 64, 32);
    expect(region.x).toBe(32);
    expect(region.y).toBe(16);
    expect(region.width).toBe(64);
    expect(region.height).toBe(32);
  });

  test('default extrusion is zero on all sides', () => {
    const tex = makeTexture(256, 128);
    const region = makeRegion(tex);
    expect(region.extrusion).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
  });
});

// ---------------------------------------------------------------------------
// Normalised UVs
// ---------------------------------------------------------------------------

describe('TextureRegion — UV coordinates', () => {
  test('full texture region produces u0=0, v0=0, u1=1, v1=1', () => {
    const tex = makeTexture(256, 128);
    const region = makeRegion(tex);
    expect(region.u0).toBe(0);
    expect(region.v0).toBe(0);
    expect(region.u1).toBe(1);
    expect(region.v1).toBe(1);
  });

  test('sub-region UVs are normalised correctly', () => {
    const tex = makeTexture(256, 128);
    const region = makeRegion(tex, 32, 16, 64, 32);
    expect(region.u0).toBe(32 / 256); // 0.125
    expect(region.v0).toBe(16 / 128); // 0.125
    expect(region.u1).toBe(96 / 256); // 0.375
    expect(region.v1).toBe(48 / 128); // 0.375
  });

  test('sub-region UVs for non-square texture', () => {
    const tex = makeTexture(200, 50);
    const region = makeRegion(tex, 0, 0, 200, 25);
    expect(region.u0).toBe(0);
    expect(region.v0).toBe(0);
    expect(region.u1).toBe(1);
    expect(region.v1).toBe(0.5);
  });

  test('UVs are derived from texture dimensions, not source dimensions', () => {
    const tex = makeTexture(512, 256);
    const region = makeRegion(tex, 64, 32, 128, 64);
    expect(region.u0).toBe(64 / 512); // 0.125
    expect(region.v0).toBe(32 / 256); // 0.125
    expect(region.u1).toBe(192 / 512); // 0.375
    expect(region.v1).toBe(96 / 256); // 0.375
  });

  test('U increases with x (left-to-right)', () => {
    const tex = makeTexture(100, 100);
    const left = makeRegion(tex, 0, 0, 50, 100);
    const right = makeRegion(tex, 50, 0, 50, 100);
    expect(right.u0).toBeGreaterThan(left.u0);
  });

  test('V increases with y (top-to-bottom)', () => {
    const tex = makeTexture(100, 100);
    const top = makeRegion(tex, 0, 0, 100, 50);
    const bottom = makeRegion(tex, 0, 50, 100, 50);
    expect(bottom.v0).toBeGreaterThan(top.v0);
  });
});

// ---------------------------------------------------------------------------
// Immutability
// ---------------------------------------------------------------------------

describe('TextureRegion — immutability', () => {
  test('properties are read-only after construction', () => {
    const tex = makeTexture(256, 128);
    const region = makeRegion(tex, 32, 16, 64, 32);

    expect(region.x).toBe(32);
    expect(region.u0).toBe(32 / 256);

    // Check that the same values are returned on repeated reads
    expect(region.x).toBe(32);
    expect(region.y).toBe(16);
    expect(region.width).toBe(64);
    expect(region.height).toBe(32);

    // texture reference is stable
    expect(region.texture).toBe(tex);
  });

  test('caller-owned extrusion object is not retained directly', () => {
    const tex = makeTexture(256, 128);
    const input = { left: 1, top: 2, right: 3, bottom: 4 };
    const region = new TextureRegion(tex, { x: 16, y: 16, width: 64, height: 32, extrusion: input });

    // The caller's object was NOT stored — a copy was made
    expect(region.extrusion).not.toBe(input);
    // Values were preserved
    expect(region.extrusion).toEqual(input);
  });

  test('mutation of caller object does not affect region', () => {
    const tex = makeTexture(256, 128);
    const input = { left: 1, top: 2, right: 3, bottom: 4 };
    const region = new TextureRegion(tex, { x: 16, y: 16, width: 64, height: 32, extrusion: input });

    input.left = 99;

    expect(region.extrusion.left).toBe(1);
  });

  test('extrusion object is frozen at runtime', () => {
    const tex = makeTexture(256, 128);
    const region = new TextureRegion(tex, { x: 16, y: 16, width: 64, height: 32, extrusion: { left: 2, top: 2, right: 2, bottom: 2 } });

    expect(Object.isFrozen(region.extrusion)).toBe(true);
  });

  test('extrusion object is frozen at runtime — uniform number shorthand', () => {
    const tex = makeTexture(256, 128);
    const region = new TextureRegion(tex, { x: 16, y: 16, width: 64, height: 32, extrusion: 2 });

    expect(Object.isFrozen(region.extrusion)).toBe(true);
  });

  test('extrusion object is frozen at runtime — omitted extrusion', () => {
    const tex = makeTexture(256, 128);
    const region = makeRegion(tex);

    expect(Object.isFrozen(region.extrusion)).toBe(true);
  });

  test('direct runtime mutation of frozen extrusion throws in strict mode', () => {
    const tex = makeTexture(256, 128);
    const region = new TextureRegion(tex, { x: 16, y: 16, width: 64, height: 32, extrusion: 3 });

    expect(() => {
      (region.extrusion as { left: number }).left = 99;
    }).toThrow();
  });

  test('TextureRegion instance is frozen', () => {
    const tex = makeTexture(256, 128);
    const region = new TextureRegion(tex, { x: 16, y: 16, width: 64, height: 32, extrusion: { left: 1, top: 2, right: 3, bottom: 4 } });

    expect(Object.isFrozen(region)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Extrusion / padding
// ---------------------------------------------------------------------------

describe('TextureRegion — extrusion', () => {
  test('uniform extrusion shorthand sets all four sides', () => {
    const tex = makeTexture(256, 128);
    const region = new TextureRegion(tex, { x: 16, y: 8, width: 64, height: 32, extrusion: 2 });
    expect(region.extrusion).toEqual({ left: 2, top: 2, right: 2, bottom: 2 });
  });

  test('per-side extrusion via TextureRegionInsets', () => {
    const tex = makeTexture(256, 128);
    const region = new TextureRegion(tex, {
      x: 16,
      y: 8,
      width: 64,
      height: 32,
      extrusion: { left: 1, top: 2, right: 3, bottom: 4 },
    });
    expect(region.extrusion).toEqual({ left: 1, top: 2, right: 3, bottom: 4 });
  });

  test('zero extrusion is valid', () => {
    const tex = makeTexture(256, 128);
    const region = new TextureRegion(tex, { x: 0, y: 0, width: 128, height: 64, extrusion: 0 });
    expect(region.extrusion).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('TextureRegion — validation', () => {
  test('throws on negative x', () => {
    const tex = makeTexture(256, 128);
    expect(() => new TextureRegion(tex, { x: -1, y: 0, width: 64, height: 32 })).toThrow();
  });

  test('throws on negative y', () => {
    const tex = makeTexture(256, 128);
    expect(() => new TextureRegion(tex, { x: 0, y: -1, width: 64, height: 32 })).toThrow();
  });

  test('throws on zero width', () => {
    const tex = makeTexture(256, 128);
    expect(() => new TextureRegion(tex, { x: 0, y: 0, width: 0, height: 32 })).toThrow();
  });

  test('throws on zero height', () => {
    const tex = makeTexture(256, 128);
    expect(() => new TextureRegion(tex, { x: 0, y: 0, width: 64, height: 0 })).toThrow();
  });

  test('throws on negative width', () => {
    const tex = makeTexture(256, 128);
    expect(() => new TextureRegion(tex, { x: 0, y: 0, width: -10, height: 32 })).toThrow();
  });

  test('throws on negative height', () => {
    const tex = makeTexture(256, 128);
    expect(() => new TextureRegion(tex, { x: 0, y: 0, width: 64, height: -10 })).toThrow();
  });

  test('throws when region extends beyond texture right edge', () => {
    const tex = makeTexture(256, 128);
    expect(() => new TextureRegion(tex, { x: 200, y: 0, width: 100, height: 32 })).toThrow();
  });

  test('throws when region extends beyond texture bottom edge', () => {
    const tex = makeTexture(256, 128);
    expect(() => new TextureRegion(tex, { x: 0, y: 100, width: 64, height: 50 })).toThrow();
  });

  test('throws when origin is outside texture', () => {
    const tex = makeTexture(256, 128);
    expect(() => new TextureRegion(tex, { x: 256, y: 0, width: 64, height: 32 })).toThrow();
  });

  test('throws on non-finite x', () => {
    const tex = makeTexture(256, 128);
    expect(() => new TextureRegion(tex, { x: NaN, y: 0, width: 64, height: 32 })).toThrow();
  });

  test('throws on non-finite y', () => {
    const tex = makeTexture(256, 128);
    expect(() => new TextureRegion(tex, { x: 0, y: Infinity, width: 64, height: 32 })).toThrow();
  });

  test('throws on non-finite width', () => {
    const tex = makeTexture(256, 128);
    expect(() => new TextureRegion(tex, { x: 0, y: 0, width: -Infinity, height: 32 })).toThrow();
  });

  test('throws on non-finite height', () => {
    const tex = makeTexture(256, 128);
    expect(() => new TextureRegion(tex, { x: 0, y: 0, width: 64, height: NaN })).toThrow();
  });

  test('throws when texture has zero width', () => {
    const tex = makeTexture(0, 128);
    expect(() => new TextureRegion(tex, { x: 0, y: 0, width: 64, height: 32 })).toThrow();
  });

  test('throws when texture has zero height', () => {
    const tex = makeTexture(256, 0);
    expect(() => new TextureRegion(tex, { x: 0, y: 0, width: 64, height: 32 })).toThrow();
  });

  test('throws when texture is null', () => {
    expect(() => new TextureRegion(null as unknown as Texture, { x: 0, y: 0, width: 64, height: 32 })).toThrow();
  });

  test('throws on negative extrusion', () => {
    const tex = makeTexture(256, 128);
    expect(() => new TextureRegion(tex, { x: 10, y: 10, width: 64, height: 32, extrusion: -1 })).toThrow();
  });

  test('throws on per-side negative extrusion', () => {
    const tex = makeTexture(256, 128);
    expect(
      () =>
        new TextureRegion(tex, {
          x: 10,
          y: 10,
          width: 64,
          height: 32,
          extrusion: { left: 0, top: -1, right: 0, bottom: 0 },
        }),
    ).toThrow();
  });

  test('throws when extrusion exceeds available source bounds', () => {
    const tex = makeTexture(256, 128);
    // Region at x=10, so left extrusion max is 10
    expect(() => new TextureRegion(tex, { x: 10, y: 10, width: 64, height: 32, extrusion: 11 })).toThrow();
  });

  test('throws when right extrusion exceeds remaining texture space', () => {
    const tex = makeTexture(256, 128);
    // Region x=200, w=50, right edge at 250, so right extrusion max is 6
    expect(() => new TextureRegion(tex, { x: 200, y: 10, width: 50, height: 32, extrusion: { left: 0, top: 0, right: 10, bottom: 0 } })).toThrow();
  });

  test('throws on non-finite extrusion values', () => {
    const tex = makeTexture(256, 128);
    expect(() => new TextureRegion(tex, { x: 10, y: 10, width: 64, height: 32, extrusion: NaN })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('TextureRegion — edge cases', () => {
  test('region at texture origin (0,0)', () => {
    const tex = makeTexture(256, 128);
    const region = makeRegion(tex, 0, 0, 128, 64);
    expect(region.u0).toBe(0);
    expect(region.v0).toBe(0);
  });

  test('region aligned to bottom-right corner', () => {
    const tex = makeTexture(256, 128);
    const region = makeRegion(tex, 128, 64, 128, 64);
    expect(region.u0).toBe(128 / 256);
    expect(region.v0).toBe(64 / 128);
    expect(region.u1).toBe(1);
    expect(region.v1).toBe(1);
  });

  test('1x1 pixel region', () => {
    const tex = makeTexture(256, 128);
    const region = makeRegion(tex, 100, 50, 1, 1);
    expect(region.width).toBe(1);
    expect(region.height).toBe(1);
  });

  test('square texture produces correct UVs', () => {
    const tex = makeTexture(64, 64);
    const region = makeRegion(tex, 16, 16, 32, 32);
    expect(region.u0).toBe(0.25);
    expect(region.v0).toBe(0.25);
    expect(region.u1).toBe(0.75);
    expect(region.v1).toBe(0.75);
  });
});
