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
