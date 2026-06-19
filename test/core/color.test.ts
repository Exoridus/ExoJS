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
    expect(color.toRgba()).toBe(0xff0000ff);
  });
});

// toRgba() must preserve RGB at every alpha. The old `this._a && …` guard
// collapsed any fully-transparent color to 0, so transparent red == transparent
// black — which loses hue when alpha is animated 0 -> 1 or the packed value is
// unpacked downstream.
describe('Color — toRgba packs RGB at every alpha', () => {
  test('a fully transparent color keeps its RGB channels', () => {
    const transparentRed = new Color(255, 0, 0, 0);
    const transparentBlack = new Color(0, 0, 0, 0);

    expect(transparentRed.toRgba()).toBe(0x000000ff); // a=0, b=0, g=0, r=255
    expect(transparentBlack.toRgba()).toBe(0x00000000);
    expect(transparentRed.toRgba()).not.toBe(transparentBlack.toRgba());
  });

  test('alpha occupies the high byte', () => {
    expect(new Color(0, 0, 0, 1).toRgba()).toBe(0xff000000);
    expect(new Color(0, 0, 0, 0.5).toRgba()).toBe(0x7f000000); // (0.5*255 | 0) = 127 = 0x7f
  });
});
