import { Color } from '#core/Color';

// Channel saturation: RGB channels clamp to 0..255 (integer) instead of wrapping
// via the old `& 255` bitmask. In-range values are unchanged; only out-of-range
// inputs (user error) now saturate rather than silently wrapping around.

describe('Color — channel saturation', () => {
  test('in-range channels are stored unchanged', () => {
    const color = new Color(10, 128, 255, 0.5);

    expect(color.r).toBe(10);
    expect(color.g).toBe(128);
    expect(color.b).toBe(255);
    expect(color.a).toBe(0.5);
  });

  test('above-range channels saturate to 255 (no wrap-around)', () => {
    const color = new Color(300, 256, 1000);

    // Old behaviour wrapped via `& 255` (300 -> 44); new behaviour saturates.
    expect(color.r).toBe(255);
    expect(color.g).toBe(255);
    expect(color.b).toBe(255);
  });

  test('below-range channels saturate to 0 (no wrap-around)', () => {
    const color = new Color(-5, -1, -300);

    // Old behaviour wrapped (-5 & 255 -> 251); new behaviour clamps to 0.
    expect(color.r).toBe(0);
    expect(color.g).toBe(0);
    expect(color.b).toBe(0);
  });

  test('fractional channels are truncated to an integer', () => {
    const color = new Color(128.9, 0.4, 254.6);

    expect(color.r).toBe(128);
    expect(color.g).toBe(0);
    expect(color.b).toBe(254);
  });

  test('per-channel setters saturate', () => {
    const color = new Color();

    color.r = 300;
    color.g = -10;
    color.b = 127.8;

    expect(color.r).toBe(255);
    expect(color.g).toBe(0);
    expect(color.b).toBe(127);
  });

  test('set() saturates all RGB channels and clamps alpha', () => {
    const color = new Color();

    color.set(999, -1, 128, 5);

    expect(color.r).toBe(255);
    expect(color.g).toBe(0);
    expect(color.b).toBe(128);
    expect(color.a).toBe(1); // alpha clamped to 0..1
  });

  test('toRgba/toString reflect the saturated channels', () => {
    const color = new Color(300, 0, 0, 1);

    expect(color.toString()).toBe('#ff0000');
    expect(color.toRgba8()).toBe(0xff0000ff);
  });
});

// toRgba8() must preserve RGB at every alpha. The old `this._a && ...` guard
// collapsed any fully-transparent color to 0, so transparent red == transparent
// black - which loses hue when alpha is animated 0 -> 1 or the packed value is
// unpacked downstream.
describe('Color — toRgba packs RGB at every alpha', () => {
  test('a fully transparent color keeps its RGB channels', () => {
    const transparentRed = new Color(255, 0, 0, 0);
    const transparentBlack = new Color(0, 0, 0, 0);

    expect(transparentRed.toRgba8()).toBe(0x000000ff); // a=0, b=0, g=0, r=255
    expect(transparentBlack.toRgba8()).toBe(0x00000000);
    expect(transparentRed.toRgba8()).not.toBe(transparentBlack.toRgba8());
  });

  test('alpha occupies the high byte', () => {
    expect(new Color(0, 0, 0, 1).toRgba8()).toBe(0xff000000);
    expect(new Color(0, 0, 0, 0.5).toRgba8()).toBe(0x7f000000); // (0.5*255 | 0) = 127 = 0x7f
  });
});

// The numeric colour form is `0xRRGGBB` only. A packed number carries no
// leading zeros, so an eight-digit RGBA literal collides with a six-digit RGB
// one (`0x00FF00FF === 0xFF00FF`); alpha therefore travels separately, or in a
// string, where the length is still readable.
describe('Color — packed and hex input', () => {
  test('a single number is read as 0xRRGGBB', () => {
    const color = new Color(0x6495ed);

    expect([color.r, color.g, color.b, color.a]).toEqual([0x64, 0x95, 0xed, 1]);
  });

  test('the second argument is alpha in the packed form', () => {
    expect(new Color(0xff00ff, 0.25).a).toBe(0.25);
  });

  test('no arguments is opaque black, as before', () => {
    expect([...new Color().toArray()]).toEqual([0, 0, 0, 1]);
  });

  test('three or more arguments stay channel-wise', () => {
    const color = new Color(0x64, 0x95, 0xed);

    expect([color.r, color.g, color.b]).toEqual([0x64, 0x95, 0xed]);
  });

  test('a packed value wider than 0xFFFFFF is rejected in a dev build', () => {
    expect(() => new Color(0xff00ff00)).toThrow(/0x000000\.\.0xFFFFFF/);
  });

  test.each([
    ['#f0f', 255, 0, 255, 1],
    ['#f0f8', 255, 0, 255, 0x88 / 255],
    ['#ff00ff', 255, 0, 255, 1],
    ['#ff00ffcc', 255, 0, 255, 0xcc / 255],
    ['ff00ff', 255, 0, 255, 1],
  ])('fromHex(%s) reads the CSS form, alpha last', (hex, r, g, b, a) => {
    const color = Color.fromHex(hex as string);

    expect([color.r, color.g, color.b]).toEqual([r, g, b]);
    expect(color.a).toBeCloseTo(a as number, 5);
  });

  test('an explicit alpha overrides one the string carried', () => {
    expect(Color.fromHex('#ff00ffcc', 0.5).a).toBe(0.5);
  });

  test('a string that is not a hex colour throws, in every build', () => {
    expect(() => Color.fromHex('#gg0000')).toThrow(/not a hex color/);
    expect(() => Color.fromHex('#ff00f')).toThrow(/not a hex color/);
    expect(() => Color.fromHex('rgb(255, 0, 255)')).toThrow(/not a hex color/);
  });

  test('from() accepts every input form', () => {
    const source = new Color(0xff00ff, 0.5);

    expect(Color.from(source).equals(source)).toBe(true);
    expect(Color.from(source, 1).a).toBe(1);
    expect(Color.from({ r: 255, g: 0, b: 255 }).toRgb()).toBe(0xff00ff);
    expect(Color.from(0xff00ff).toRgb()).toBe(0xff00ff);
    expect(Color.from('#f0f').toRgb()).toBe(0xff00ff);
  });

  test('setHex overwrites in place and returns the same instance', () => {
    const color = new Color(0x000000);
    const returned = color.setHex('#ff00ff');

    expect(returned).toBe(color);
    expect(color.toRgb()).toBe(0xff00ff);
  });
});

describe('Color — numeric and string output', () => {
  test('toRgb round-trips through the constructor', () => {
    expect(new Color(new Color(0x6495ed).toRgb()).toRgb()).toBe(0x6495ed);
  });

  test('toHex round-trips through fromHex, with and without alpha', () => {
    const color = new Color(0x6495ed, 0.8);

    expect(Color.fromHex(color.toHex()).toRgb()).toBe(0x6495ed);
    expect(Color.fromHex(color.toHex(true)).a).toBeCloseTo(0.8, 2);
    expect(color.toHex(false, false)).toBe('6495ed');
  });

  test('toRgba8 is the reverse byte order of toRgb and must not be fed back in', () => {
    const color = new Color(0xff0000);

    expect(color.toRgb()).toBe(0xff0000);
    expect(color.toRgba8()).toBe(0xff0000ff);
  });
});

describe('Color — named constants', () => {
  test('the eight corners of the RGB cube are the whole vocabulary', () => {
    expect(Color.black.toRgb()).toBe(0x000000);
    expect(Color.red.toRgb()).toBe(0xff0000);
    expect(Color.green.toRgb()).toBe(0x00ff00);
    expect(Color.blue.toRgb()).toBe(0x0000ff);
    expect(Color.cyan.toRgb()).toBe(0x00ffff);
    expect(Color.magenta.toRgb()).toBe(0xff00ff);
    expect(Color.yellow.toRgb()).toBe(0xffff00);
    expect(Color.white.toRgb()).toBe(0xffffff);
  });

  test('transparent is CSS transparent, which is the same value as transparentBlack', () => {
    expect(Color.transparent).toBe(Color.transparentBlack);
    expect([Color.transparent.toRgb(), Color.transparent.a]).toEqual([0x000000, 0]);
    expect(Color.transparentWhite.toRgb()).toBe(0xffffff);
  });
});

// The shared corners are frozen under `__DEV__`, which vitest defines as true.
// A production build leaves them writable; these expectations describe the dev
// build only.
describe('Color — the shared corners are frozen in dev builds', () => {
  test('every corner is frozen, including the transparent ends', () => {
    for (const color of [
      Color.black,
      Color.red,
      Color.green,
      Color.blue,
      Color.cyan,
      Color.magenta,
      Color.yellow,
      Color.white,
      Color.transparentBlack,
      Color.transparentWhite,
    ]) {
      expect(Object.isFrozen(color)).toBe(true);
    }
  });

  test('mutating a corner throws instead of repainting every other reader', () => {
    expect(() => Color.white.set(0, 0, 0)).toThrow(TypeError);
    expect(() => (Color.black.r = 255)).toThrow(TypeError);
    expect(() => Color.red.setHex('#00ff00')).toThrow(TypeError);
    expect(() => Color.blue.copy(Color.green)).toThrow(TypeError);

    expect(Color.white.toRgb()).toBe(0xffffff);
    expect(Color.black.toRgb()).toBe(0x000000);
    expect(Color.red.toRgb()).toBe(0xff0000);
    expect(Color.blue.toRgb()).toBe(0x0000ff);
  });

  test('the lazy caches are warm, so reading a corner still works', () => {
    expect(Color.magenta.toRgba8()).toBe(0xffff00ff);
    expect([...Color.yellow.toArray()]).toEqual([255, 255, 0, 1]);
    expect([...Color.yellow.toArray(true)]).toEqual([1, 1, 0, 1]);
  });

  test('a clone of a corner is an ordinary mutable color', () => {
    const color = Color.white.clone();

    expect(Object.isFrozen(color)).toBe(false);
    expect(color.set(0, 0, 0).toRgb()).toBe(0x000000);
    expect(Color.white.toRgb()).toBe(0xffffff);
  });
});
