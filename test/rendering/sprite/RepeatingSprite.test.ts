import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import type { Texture } from '#rendering/texture/Texture';
import { TextureRegion } from '#rendering/texture/TextureRegion';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeTex = (w = 128, h = 64): Texture =>
  ({ width: w, height: h, flipY: false }) as unknown as Texture;

const makeRegion = (tex: Texture, x = 0, y = 0, width?: number, height?: number): TextureRegion =>
  new TextureRegion(tex, { x, y, width: width ?? tex.width, height: height ?? tex.height });

const getDirty = (sprite: RepeatingSprite): boolean =>
  (sprite as unknown as Record<string, unknown>)['_geometryDirty'] as boolean;

// ---------------------------------------------------------------------------
// Strategy selection
// ---------------------------------------------------------------------------

describe('RepeatingSprite — strategy', () => {
  test('bare Texture → shader strategy', () => {
    const tex = makeTex();
    const sprite = new RepeatingSprite(tex);
    expect(sprite.resolvedStrategy).toBe('shader');
  });

  test('TextureRegion → geometry strategy', () => {
    const tex = makeTex();
    const region = makeRegion(tex, 0, 0, 64, 32);
    const sprite = new RepeatingSprite(region);
    expect(sprite.resolvedStrategy).toBe('geometry');
  });
});

// ---------------------------------------------------------------------------
// Constructor with bare Texture
// ---------------------------------------------------------------------------

describe('RepeatingSprite — constructor with Texture', () => {
  test('auto-creates full-coverage TextureRegion', () => {
    const tex = makeTex(128, 64);
    const sprite = new RepeatingSprite(tex);
    expect(sprite.region).toBeInstanceOf(TextureRegion);
    expect(sprite.region.width).toBe(128);
    expect(sprite.region.height).toBe(64);
  });

  test('source returns the original Texture', () => {
    const tex = makeTex();
    const sprite = new RepeatingSprite(tex);
    expect(sprite.source).toBe(tex);
  });

  test('texture returns the same Texture', () => {
    const tex = makeTex();
    const sprite = new RepeatingSprite(tex);
    expect(sprite.texture).toBe(tex);
  });

  test('defaults width and height to texture dimensions', () => {
    const tex = makeTex(200, 100);
    const sprite = new RepeatingSprite(tex);
    expect(sprite.width).toBe(200);
    expect(sprite.height).toBe(100);
  });

  test('explicit width and height override texture dimensions', () => {
    const tex = makeTex(128, 64);
    const sprite = new RepeatingSprite(tex, { width: 400, height: 300 });
    expect(sprite.width).toBe(400);
    expect(sprite.height).toBe(300);
  });

  test('defaults modeX = repeat, modeY = repeat', () => {
    const tex = makeTex();
    const sprite = new RepeatingSprite(tex);
    expect(sprite.modeX).toBe('repeat');
    expect(sprite.modeY).toBe('repeat');
  });

  test('defaults fitX = round, fitY = round', () => {
    const tex = makeTex();
    const sprite = new RepeatingSprite(tex);
    expect(sprite.fitX).toBe('round');
    expect(sprite.fitY).toBe('round');
  });

  test('defaults offsetX = 0, offsetY = 0', () => {
    const tex = makeTex();
    const sprite = new RepeatingSprite(tex);
    expect(sprite.offsetX).toBe(0);
    expect(sprite.offsetY).toBe(0);
  });

  test('constructor options override all defaults', () => {
    const tex = makeTex(128, 64);
    const sprite = new RepeatingSprite(tex, {
      width: 500, height: 250,
      modeX: 'mirror-repeat', modeY: 'stretch',
      fitX: 'clip', fitY: 'clip',
      offsetX: 12, offsetY: -8,
    });
    expect(sprite.width).toBe(500);
    expect(sprite.height).toBe(250);
    expect(sprite.modeX).toBe('mirror-repeat');
    expect(sprite.modeY).toBe('stretch');
    expect(sprite.fitX).toBe('clip');
    expect(sprite.fitY).toBe('clip');
    expect(sprite.offsetX).toBe(12);
    expect(sprite.offsetY).toBe(-8);
  });
});

// ---------------------------------------------------------------------------
// Constructor with TextureRegion
// ---------------------------------------------------------------------------

describe('RepeatingSprite — constructor with TextureRegion', () => {
  test('uses the provided region directly', () => {
    const tex = makeTex(256, 128);
    const region = makeRegion(tex, 64, 32, 64, 64);
    const sprite = new RepeatingSprite(region);
    expect(sprite.region).toBe(region);
  });

  test('source returns the original TextureRegion', () => {
    const tex = makeTex();
    const region = makeRegion(tex, 0, 0, 64, 64);
    const sprite = new RepeatingSprite(region);
    expect(sprite.source).toBe(region);
  });

  test('texture returns the underlying Texture of the region', () => {
    const tex = makeTex();
    const region = makeRegion(tex, 0, 0, 64, 64);
    const sprite = new RepeatingSprite(region);
    expect(sprite.texture).toBe(tex);
  });

  test('defaults width and height to region dimensions', () => {
    const tex = makeTex(256, 256);
    const region = makeRegion(tex, 0, 0, 64, 48);
    const sprite = new RepeatingSprite(region);
    expect(sprite.width).toBe(64);
    expect(sprite.height).toBe(48);
  });
});

// ---------------------------------------------------------------------------
// Constructor validation
// ---------------------------------------------------------------------------

describe('RepeatingSprite — constructor validation', () => {
  test('throws on invalid modeX', () => {
    const tex = makeTex();
    expect(() => new RepeatingSprite(tex, { modeX: 'tile' as never })).toThrow('modeX');
  });

  test('throws on invalid modeY', () => {
    const tex = makeTex();
    expect(() => new RepeatingSprite(tex, { modeY: 'wrap' as never })).toThrow('modeY');
  });

  test('throws on invalid fitX', () => {
    const tex = makeTex();
    expect(() => new RepeatingSprite(tex, { fitX: 'stretch' as never })).toThrow('fitX');
  });

  test('throws on invalid fitY', () => {
    const tex = makeTex();
    expect(() => new RepeatingSprite(tex, { fitY: 0 as never })).toThrow('fitY');
  });

  test('throws on NaN offsetX', () => {
    const tex = makeTex();
    expect(() => new RepeatingSprite(tex, { offsetX: NaN })).toThrow(/finite/);
  });

  test('throws on Infinity offsetY', () => {
    const tex = makeTex();
    expect(() => new RepeatingSprite(tex, { offsetY: Infinity })).toThrow(/finite/);
  });

  test('throws on negative width', () => {
    const tex = makeTex();
    expect(() => new RepeatingSprite(tex, { width: -1 })).toThrow(/non-negative/);
  });

  test('throws on negative height', () => {
    const tex = makeTex();
    expect(() => new RepeatingSprite(tex, { height: -1 })).toThrow(/non-negative/);
  });

  test('throws on NaN width', () => {
    const tex = makeTex();
    expect(() => new RepeatingSprite(tex, { width: NaN })).toThrow(/finite/);
  });

  test('throws on Infinity height', () => {
    const tex = makeTex();
    expect(() => new RepeatingSprite(tex, { height: Infinity })).toThrow(/finite/);
  });

  test('accepts zero width', () => {
    const tex = makeTex();
    expect(() => new RepeatingSprite(tex, { width: 0 })).not.toThrow();
  });

  test('accepts zero height', () => {
    const tex = makeTex();
    expect(() => new RepeatingSprite(tex, { height: 0 })).not.toThrow();
  });

  test('accepts negative offset values', () => {
    const tex = makeTex();
    expect(() => new RepeatingSprite(tex, { offsetX: -100, offsetY: -200 })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Setter validation — size
// ---------------------------------------------------------------------------

describe('RepeatingSprite — setter validation (size)', () => {
  test('width setter throws on negative', () => {
    const tex = makeTex();
    const sprite = new RepeatingSprite(tex);
    expect(() => { sprite.width = -1; }).toThrow(/non-negative/);
  });

  test('width setter throws on NaN', () => {
    const tex = makeTex();
    const sprite = new RepeatingSprite(tex);
    expect(() => { sprite.width = NaN; }).toThrow(/finite/);
  });

  test('width setter preserves prior value on rejection', () => {
    const tex = makeTex(128, 64);
    const sprite = new RepeatingSprite(tex);
    const prev = sprite.width;
    try { sprite.width = -5; } catch { /* expected */ }
    expect(sprite.width).toBe(prev);
  });

  test('height setter throws on Infinity', () => {
    const tex = makeTex();
    const sprite = new RepeatingSprite(tex);
    expect(() => { sprite.height = Infinity; }).toThrow(/finite/);
  });

  test('setSize throws on negative', () => {
    const tex = makeTex();
    const sprite = new RepeatingSprite(tex, { width: 200, height: 100 });
    expect(() => sprite.setSize(-1, 100)).toThrow(/non-negative/);
  });

  test('setSize preserves both dimensions on rejection', () => {
    const tex = makeTex();
    const sprite = new RepeatingSprite(tex, { width: 200, height: 100 });
    void sprite.quads;
    try { sprite.setSize(Infinity, 50); } catch { /* expected */ }
    expect(sprite.width).toBe(200);
    expect(sprite.height).toBe(100);
  });

  test('failed setSize does not mark dirty', () => {
    const tex = makeTex();
    const region = makeRegion(tex);
    const sprite = new RepeatingSprite(region);
    void sprite.quads;
    try { sprite.setSize(-10, 50); } catch { /* expected */ }
    expect(getDirty(sprite)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Setter validation — modes / fits
// ---------------------------------------------------------------------------

describe('RepeatingSprite — setter validation (modes/fits)', () => {
  test('modeX setter throws on invalid value', () => {
    const tex = makeTex();
    const sprite = new RepeatingSprite(tex);
    expect(() => { sprite.modeX = 'tiling' as never; }).toThrow('modeX');
  });

  test('modeX setter preserves prior value on rejection', () => {
    const tex = makeTex();
    const sprite = new RepeatingSprite(tex);
    const prev = sprite.modeX;
    try { sprite.modeX = 'bad' as never; } catch { /* expected */ }
    expect(sprite.modeX).toBe(prev);
  });

  test('modeY setter throws on invalid value', () => {
    const tex = makeTex();
    const sprite = new RepeatingSprite(tex);
    expect(() => { sprite.modeY = null as never; }).toThrow('modeY');
  });

  test('fitX setter throws on invalid value', () => {
    const tex = makeTex();
    const sprite = new RepeatingSprite(tex);
    expect(() => { sprite.fitX = 'repeat' as never; }).toThrow('fitX');
  });

  test('fitY setter throws on invalid value', () => {
    const tex = makeTex();
    const sprite = new RepeatingSprite(tex);
    expect(() => { sprite.fitY = 'tile' as never; }).toThrow('fitY');
  });
});

// ---------------------------------------------------------------------------
// Setter validation — offset
// ---------------------------------------------------------------------------

describe('RepeatingSprite — setter validation (offset)', () => {
  test('offsetX setter throws on NaN', () => {
    const tex = makeTex();
    const sprite = new RepeatingSprite(tex);
    expect(() => { sprite.offsetX = NaN; }).toThrow(/finite/);
  });

  test('offsetY setter throws on Infinity', () => {
    const tex = makeTex();
    const sprite = new RepeatingSprite(tex);
    expect(() => { sprite.offsetY = Infinity; }).toThrow(/finite/);
  });

  test('setOffset preserves both offsets on rejection', () => {
    const tex = makeTex();
    const sprite = new RepeatingSprite(tex, { offsetX: 5, offsetY: 10 });
    try { sprite.setOffset(NaN, 20); } catch { /* expected */ }
    expect(sprite.offsetX).toBe(5);
    expect(sprite.offsetY).toBe(10);
  });

  test('failed setOffset does not dirty geometry path', () => {
    const tex = makeTex();
    const region = makeRegion(tex);
    const sprite = new RepeatingSprite(region);
    void sprite.quads;
    try { sprite.setOffset(NaN, 0); } catch { /* expected */ }
    expect(getDirty(sprite)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Dirty flag behavior — geometry path
// ---------------------------------------------------------------------------

describe('RepeatingSprite — dirty flag (geometry path)', () => {
  test('starts dirty', () => {
    const tex = makeTex();
    const region = makeRegion(tex);
    const sprite = new RepeatingSprite(region);
    expect(getDirty(sprite)).toBe(true);
  });

  test('quads access clears dirty flag', () => {
    const tex = makeTex();
    const region = makeRegion(tex);
    const sprite = new RepeatingSprite(region);
    void sprite.quads;
    expect(getDirty(sprite)).toBe(false);
  });

  test('setSize marks dirty', () => {
    const tex = makeTex();
    const region = makeRegion(tex);
    const sprite = new RepeatingSprite(region);
    void sprite.quads;
    sprite.setSize(300, 200);
    expect(getDirty(sprite)).toBe(true);
  });

  test('width setter marks dirty', () => {
    const tex = makeTex();
    const region = makeRegion(tex);
    const sprite = new RepeatingSprite(region);
    void sprite.quads;
    sprite.width = 300;
    expect(getDirty(sprite)).toBe(true);
  });

  test('height setter marks dirty', () => {
    const tex = makeTex();
    const region = makeRegion(tex);
    const sprite = new RepeatingSprite(region);
    void sprite.quads;
    sprite.height = 200;
    expect(getDirty(sprite)).toBe(true);
  });

  test('modeX change marks dirty', () => {
    const tex = makeTex();
    const region = makeRegion(tex);
    const sprite = new RepeatingSprite(region);
    void sprite.quads;
    sprite.modeX = 'mirror-repeat';
    expect(getDirty(sprite)).toBe(true);
  });

  test('modeY change marks dirty', () => {
    const tex = makeTex();
    const region = makeRegion(tex);
    const sprite = new RepeatingSprite(region);
    void sprite.quads;
    sprite.modeY = 'stretch';
    expect(getDirty(sprite)).toBe(true);
  });

  test('fitX change marks dirty', () => {
    const tex = makeTex();
    const region = makeRegion(tex);
    const sprite = new RepeatingSprite(region, { fitX: 'round' });
    void sprite.quads;
    sprite.fitX = 'clip';
    expect(getDirty(sprite)).toBe(true);
  });

  test('fitY change marks dirty', () => {
    const tex = makeTex();
    const region = makeRegion(tex);
    const sprite = new RepeatingSprite(region, { fitY: 'round' });
    void sprite.quads;
    sprite.fitY = 'clip';
    expect(getDirty(sprite)).toBe(true);
  });

  test('setOffset change marks dirty on geometry path', () => {
    const tex = makeTex();
    const region = makeRegion(tex);
    const sprite = new RepeatingSprite(region);
    void sprite.quads;
    sprite.setOffset(10, 0);
    expect(getDirty(sprite)).toBe(true);
  });

  test('offsetX setter marks dirty on geometry path', () => {
    const tex = makeTex();
    const region = makeRegion(tex);
    const sprite = new RepeatingSprite(region);
    void sprite.quads;
    sprite.offsetX = 15;
    expect(getDirty(sprite)).toBe(true);
  });

  test('offsetY setter marks dirty on geometry path', () => {
    const tex = makeTex();
    const region = makeRegion(tex);
    const sprite = new RepeatingSprite(region);
    void sprite.quads;
    sprite.offsetY = 15;
    expect(getDirty(sprite)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// No-op setters — geometry path
// ---------------------------------------------------------------------------

describe('RepeatingSprite — no-op setters (geometry path)', () => {
  test('width same value does not mark dirty', () => {
    const tex = makeTex();
    const region = makeRegion(tex);
    const sprite = new RepeatingSprite(region);
    void sprite.quads;
    const w = sprite.width;
    sprite.width = w;
    expect(getDirty(sprite)).toBe(false);
  });

  test('height same value does not mark dirty', () => {
    const tex = makeTex();
    const region = makeRegion(tex);
    const sprite = new RepeatingSprite(region);
    void sprite.quads;
    const h = sprite.height;
    sprite.height = h;
    expect(getDirty(sprite)).toBe(false);
  });

  test('setSize same values does not mark dirty', () => {
    const tex = makeTex();
    const region = makeRegion(tex);
    const sprite = new RepeatingSprite(region);
    void sprite.quads;
    sprite.setSize(sprite.width, sprite.height);
    expect(getDirty(sprite)).toBe(false);
  });

  test('modeX same value does not mark dirty', () => {
    const tex = makeTex();
    const region = makeRegion(tex);
    const sprite = new RepeatingSprite(region);
    void sprite.quads;
    const mx = sprite.modeX;
    sprite.modeX = mx;
    expect(getDirty(sprite)).toBe(false);
  });

  test('modeY same value does not mark dirty', () => {
    const tex = makeTex();
    const region = makeRegion(tex);
    const sprite = new RepeatingSprite(region);
    void sprite.quads;
    const my = sprite.modeY;
    sprite.modeY = my;
    expect(getDirty(sprite)).toBe(false);
  });

  test('fitX same value does not mark dirty', () => {
    const tex = makeTex();
    const region = makeRegion(tex);
    const sprite = new RepeatingSprite(region);
    void sprite.quads;
    const fx = sprite.fitX;
    sprite.fitX = fx;
    expect(getDirty(sprite)).toBe(false);
  });

  test('fitY same value does not mark dirty', () => {
    const tex = makeTex();
    const region = makeRegion(tex);
    const sprite = new RepeatingSprite(region);
    void sprite.quads;
    const fy = sprite.fitY;
    sprite.fitY = fy;
    expect(getDirty(sprite)).toBe(false);
  });

  test('setOffset same values does not mark dirty', () => {
    const tex = makeTex();
    const region = makeRegion(tex);
    const sprite = new RepeatingSprite(region);
    void sprite.quads;
    sprite.setOffset(0, 0);
    expect(getDirty(sprite)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Shader path — offset does NOT trigger geometry rebuild
// ---------------------------------------------------------------------------

describe('RepeatingSprite — shader path offset behavior', () => {
  test('quads stays empty on shader path after offset change', () => {
    const tex = makeTex();
    const sprite = new RepeatingSprite(tex);
    sprite.setOffset(20, 10);
    expect(sprite.quads).toHaveLength(0);
  });

  test('setOffset stores the new offset values on shader path', () => {
    const tex = makeTex();
    const sprite = new RepeatingSprite(tex, { offsetX: 5, offsetY: 3 });
    sprite.setOffset(30, 15);
    expect(sprite.offsetX).toBe(30);
    expect(sprite.offsetY).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// Lazy geometry build — geometry path
// ---------------------------------------------------------------------------

describe('RepeatingSprite — lazy geometry (geometry path)', () => {
  test('quads not built until accessed', () => {
    const tex = makeTex();
    const region = makeRegion(tex);
    const sprite = new RepeatingSprite(region);
    expect(getDirty(sprite)).toBe(true);
    const quads = sprite.quads;
    expect(quads.length).toBeGreaterThan(0);
    expect(getDirty(sprite)).toBe(false);
  });

  test('second quads access returns same array without rebuild', () => {
    const tex = makeTex();
    const region = makeRegion(tex);
    const sprite = new RepeatingSprite(region);
    const q1 = sprite.quads;
    const q2 = sprite.quads;
    expect(q1).toBe(q2);
  });

  test('quads rebuilt after mutation', () => {
    const tex = makeTex();
    const region = makeRegion(tex);
    const sprite = new RepeatingSprite(region);
    const q1 = sprite.quads;
    sprite.setSize(300, 200);
    const q2 = sprite.quads;
    expect(q1).not.toBe(q2);
  });

  test('zero-width destination: quads is empty', () => {
    const tex = makeTex();
    const region = makeRegion(tex);
    const sprite = new RepeatingSprite(region, { width: 0, height: 100 });
    expect(sprite.quads).toHaveLength(0);
  });

  test('zero-height destination: quads is empty', () => {
    const tex = makeTex();
    const region = makeRegion(tex);
    const sprite = new RepeatingSprite(region, { width: 100, height: 0 });
    expect(sprite.quads).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Shader path — quads is always empty
// ---------------------------------------------------------------------------

describe('RepeatingSprite — quads on shader path', () => {
  test('quads is empty for bare Texture', () => {
    const tex = makeTex(128, 64);
    const sprite = new RepeatingSprite(tex, { width: 300, height: 200 });
    expect(sprite.quads).toHaveLength(0);
  });

  test('quads stays empty after size change on shader path', () => {
    const tex = makeTex();
    const sprite = new RepeatingSprite(tex);
    sprite.setSize(500, 400);
    expect(sprite.quads).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

describe('RepeatingSprite — bounds', () => {
  test('getLocalBounds returns (0, 0, width, height)', () => {
    const tex = makeTex();
    const sprite = new RepeatingSprite(tex, { width: 400, height: 250 });
    const bounds = sprite.getLocalBounds();
    expect(bounds.x).toBe(0);
    expect(bounds.y).toBe(0);
    expect(bounds.width).toBe(400);
    expect(bounds.height).toBe(250);
  });

  test('getLocalBounds reflects default dimensions', () => {
    const tex = makeTex(128, 64);
    const sprite = new RepeatingSprite(tex);
    const bounds = sprite.getLocalBounds();
    expect(bounds.width).toBe(128);
    expect(bounds.height).toBe(64);
  });

  test('getLocalBounds with zero size', () => {
    const tex = makeTex();
    const sprite = new RepeatingSprite(tex, { width: 0, height: 0 });
    const bounds = sprite.getLocalBounds();
    expect(bounds.width).toBe(0);
    expect(bounds.height).toBe(0);
  });

  test('getLocalBounds updates after setSize', () => {
    const tex = makeTex();
    const sprite = new RepeatingSprite(tex, { width: 100, height: 100 });
    sprite.setSize(800, 600);
    const bounds = sprite.getLocalBounds();
    expect(bounds.width).toBe(800);
    expect(bounds.height).toBe(600);
  });
});

// ---------------------------------------------------------------------------
// setSize and setOffset return this (fluent)
// ---------------------------------------------------------------------------

describe('RepeatingSprite — fluent API', () => {
  test('setSize returns the sprite instance', () => {
    const tex = makeTex();
    const sprite = new RepeatingSprite(tex);
    expect(sprite.setSize(200, 100)).toBe(sprite);
  });

  test('setOffset returns the sprite instance', () => {
    const tex = makeTex();
    const sprite = new RepeatingSprite(tex);
    expect(sprite.setOffset(5, 10)).toBe(sprite);
  });
});
