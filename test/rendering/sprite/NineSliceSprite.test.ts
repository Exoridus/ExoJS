import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
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
// Constructor with Texture
// ---------------------------------------------------------------------------

describe('NineSliceSprite — constructor with Texture', () => {
  test('auto-creates full TextureRegion from Texture', () => {
    const tex = makeTexture(64, 64);
    const sprite = new NineSliceSprite(tex, { slices: 10 });
    expect(sprite.region).toBeInstanceOf(TextureRegion);
    expect(sprite.region.width).toBe(64);
    expect(sprite.region.height).toBe(64);
    expect(sprite.texture).toBe(tex);
  });

  test('default width and height equal region dimensions', () => {
    const tex = makeTexture(64, 32);
    const sprite = new NineSliceSprite(tex, { slices: 5 });
    expect(sprite.width).toBe(64);
    expect(sprite.height).toBe(32);
  });

  test('explicit width and height override region dimensions', () => {
    const tex = makeTexture(64, 32);
    const sprite = new NineSliceSprite(tex, { slices: 5, width: 200, height: 100 });
    expect(sprite.width).toBe(200);
    expect(sprite.height).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Constructor with TextureRegion
// ---------------------------------------------------------------------------

describe('NineSliceSprite — constructor with TextureRegion', () => {
  test('uses provided region directly', () => {
    const tex = makeTexture(128, 64);
    const region = makeRegion(tex, 0, 0, 64, 64);
    const sprite = new NineSliceSprite(region, { slices: 10 });
    expect(sprite.region).toBe(region);
    expect(sprite.width).toBe(64);
    expect(sprite.height).toBe(64);
  });
});

// ---------------------------------------------------------------------------
// Lazy geometry build
// ---------------------------------------------------------------------------

describe('NineSliceSprite — lazy geometry', () => {
  test('quads are not built until accessed', () => {
    const tex = makeTexture(64, 64);
    const sprite = new NineSliceSprite(tex, { slices: 10 });
    // Access _geometryDirty via bracket notation for testing
    expect((sprite as unknown as Record<string, unknown>)['_geometryDirty']).toBe(true);
    const quads = sprite.quads;
    expect(quads.length).toBeGreaterThan(0);
    expect((sprite as unknown as Record<string, unknown>)['_geometryDirty']).toBe(false);
  });

  test('quads not rebuilt on second access without mutation', () => {
    const tex = makeTexture(64, 64);
    const sprite = new NineSliceSprite(tex, { slices: 10 });
    const quads1 = sprite.quads;
    const quads2 = sprite.quads;
    expect(quads1).toBe(quads2);
  });
});

// ---------------------------------------------------------------------------
// Dirty flag: geometry rebuilt after mutations
// ---------------------------------------------------------------------------

describe('NineSliceSprite — dirty flag', () => {
  test('setSize marks geometry dirty', () => {
    const tex = makeTexture(64, 64);
    const sprite = new NineSliceSprite(tex, { slices: 10 });
    void sprite.quads; // build
    sprite.setSize(200, 200);
    expect((sprite as unknown as Record<string, unknown>)['_geometryDirty']).toBe(true);
  });

  test('width setter marks geometry dirty', () => {
    const tex = makeTexture(64, 64);
    const sprite = new NineSliceSprite(tex, { slices: 10 });
    void sprite.quads;
    sprite.width = 300;
    expect((sprite as unknown as Record<string, unknown>)['_geometryDirty']).toBe(true);
  });

  test('height setter marks geometry dirty', () => {
    const tex = makeTexture(64, 64);
    const sprite = new NineSliceSprite(tex, { slices: 10 });
    void sprite.quads;
    sprite.height = 300;
    expect((sprite as unknown as Record<string, unknown>)['_geometryDirty']).toBe(true);
  });

  test('setSlices marks geometry dirty', () => {
    const tex = makeTexture(64, 64);
    const sprite = new NineSliceSprite(tex, { slices: 10 });
    void sprite.quads;
    sprite.setSlices(12);
    expect((sprite as unknown as Record<string, unknown>)['_geometryDirty']).toBe(true);
  });

  test('setBorder marks geometry dirty', () => {
    const tex = makeTexture(64, 64);
    const sprite = new NineSliceSprite(tex, { slices: 10 });
    void sprite.quads;
    sprite.setBorder(15);
    expect((sprite as unknown as Record<string, unknown>)['_geometryDirty']).toBe(true);
  });

  test('setModes marks geometry dirty', () => {
    const tex = makeTexture(64, 64);
    const sprite = new NineSliceSprite(tex, { slices: 10 });
    void sprite.quads;
    sprite.setModes({ edges: 'repeat' });
    expect((sprite as unknown as Record<string, unknown>)['_geometryDirty']).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Width / height no-op on unchanged value
// ---------------------------------------------------------------------------

describe('NineSliceSprite — no-op setters', () => {
  test('width setter no-ops when value unchanged', () => {
    const tex = makeTexture(64, 64);
    const sprite = new NineSliceSprite(tex, { slices: 10 });
    void sprite.quads;
    const prevWidth = sprite.width;
    sprite.width = prevWidth;
    expect((sprite as unknown as Record<string, unknown>)['_geometryDirty']).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('NineSliceSprite — validation', () => {
  test('throws when slices.left + slices.right exceeds region width', () => {
    const tex = makeTexture(64, 64);
    expect(() => new NineSliceSprite(tex, { slices: { left: 40, top: 5, right: 30, bottom: 5 } }))
      .toThrow(/exceeds region width/);
  });

  test('throws when slices.top + slices.bottom exceeds region height', () => {
    const tex = makeTexture(64, 64);
    expect(() => new NineSliceSprite(tex, { slices: { left: 5, top: 40, right: 5, bottom: 30 } }))
      .toThrow(/exceeds region height/);
  });

  test('throws on negative slice values', () => {
    const tex = makeTexture(64, 64);
    expect(() => new NineSliceSprite(tex, { slices: { left: -1, top: 5, right: 5, bottom: 5 } }))
      .toThrow(/non-negative/);
  });

  test('does not throw when slices equal region dimensions (edge case)', () => {
    const tex = makeTexture(64, 64);
    // left + right == width is allowed (= 0 center)
    expect(() => new NineSliceSprite(tex, { slices: { left: 32, top: 32, right: 32, bottom: 32 } }))
      .not.toThrow();
  });
});
