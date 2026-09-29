/**
 * Scene serialization keeps `Color` as its authored bytes and resolves the
 * same resource interpretation on load - it is not a place the colour
 * pipeline reaches. `colorToArray`/`arrayToColor` are the one pair every
 * serializer in `uiSerializers.ts` (fill, outline, shadow, decoration,
 * gradient stop colours) round-trips a `Color` through; this suite pins that
 * pair directly rather than through every call site that happens to use it.
 */
import { Color } from '#core/Color';
import { arrayToColor, colorToArray } from '#core/serialization/serializerHelpers';

describe('Color serialization round-trip', () => {
  test('colorToArray writes the authored bytes, not a decoded or otherwise transformed value', () => {
    const color = new Color(51, 102, 153, 0.5);

    expect(colorToArray(color)).toEqual([51, 102, 153, 0.5]);
  });

  test.each([
    [0, 0, 0, 1],
    [255, 255, 255, 1],
    [128, 128, 128, 0.25],
    [51, 102, 153, 0.75],
  ])('round-trips (%d, %d, %d, %d) through colorToArray/arrayToColor unchanged', (r, g, b, a) => {
    const original = new Color(r, g, b, a);
    const restored = arrayToColor(colorToArray(original));

    expect(restored).toBeInstanceOf(Color);
    expect(restored?.r).toBe(r);
    expect(restored?.g).toBe(g);
    expect(restored?.b).toBe(b);
    expect(restored?.a).toBe(a);
  });

  test('arrayToColor resolves the same resource interpretation as the Color it was serialized from', () => {
    // Two Color instances built the same way must serialize and deserialize
    // to values that compare equal component-wise - the round trip does not
    // depend on identity, only on the authored bytes.
    const a = new Color(20, 180, 90, 0.6);
    const b = arrayToColor(colorToArray(a));

    expect(b).not.toBe(a);
    expect(colorToArray(b!)).toEqual(colorToArray(a));
  });

  test('arrayToColor returns undefined for a value that is not a 4-tuple', () => {
    expect(arrayToColor(undefined)).toBeUndefined();
    expect(arrayToColor([1, 2, 3])).toBeUndefined();
    expect(arrayToColor('not-a-color')).toBeUndefined();
  });
});
