/**
 * Numeric validation in the text-style (de)serializers.
 *
 * A deserialized style bag is untrusted input, and a `typeof x === 'number'`
 * gate admits `NaN` and `Infinity`. `Color`'s channel clamp absorbs a bad rgb
 * value but `toAlpha` passes `NaN` through, and nothing floors `fontSize`,
 * `lineHeight` or a shadow offset before it reaches the canvas, so a corrupt
 * document used to put non-finite values into `TextStyle` and the draw calls
 * that read it. Every numeric field and colour channel is validated here, at
 * the one boundary both readers share.
 */
import { Color } from '#core/Color';
import { arrayToColor, deserializeStyleOptions, jsonToGradient } from '#core/serialization/serializerHelpers';

describe('arrayToColor validation', () => {
  test('rejects a channel that is not a finite number', () => {
    expect(arrayToColor(['x', 0, 0, 1])).toBeUndefined();
    expect(arrayToColor([0, 0, 0, Number.NaN])).toBeUndefined();
    expect(arrayToColor([0, Number.POSITIVE_INFINITY, 0, 1])).toBeUndefined();
  });

  test('rejects a channel outside its documented range', () => {
    expect(arrayToColor([256, 0, 0, 1])).toBeUndefined();
    expect(arrayToColor([0, -1, 0, 1])).toBeUndefined();
    expect(arrayToColor([0, 0, 0, 1.5])).toBeUndefined();
  });

  test('accepts four finite channels inside their ranges', () => {
    expect(arrayToColor([0, 128, 255, 0.5])).toBeInstanceOf(Color);
  });
});

describe('deserializeStyleOptions numeric validation', () => {
  test('drops a non-finite number instead of storing it', () => {
    const options = deserializeStyleOptions({
      fontSize: Number.NaN,
      lineHeight: Number.NEGATIVE_INFINITY,
      shadowBlur: Number.POSITIVE_INFINITY,
      outlineWidth: 2,
    });

    expect(options).toEqual({ outlineWidth: 2 });
  });

  test('drops a colour that is not four finite in-range channels', () => {
    const options = deserializeStyleOptions({ fillColor: ['x', 0, 0, 1], shadowColor: [0, 0, 0, 2] });

    expect(options).toEqual({});
  });

  test('keeps valid style values unchanged', () => {
    const options = deserializeStyleOptions({ fontSize: 18, fillColor: [10, 20, 30, 1], decorationOffset: 3 });

    expect(options?.fontSize).toBe(18);
    expect(options?.fillColor?.r).toBe(10);
    expect(options?.fillColor?.a).toBe(1);
    expect(options?.decorationOffset).toBe(3);
  });
});

describe('jsonToGradient validation', () => {
  test('drops a stop whose offset is not finite', () => {
    const gradient = jsonToGradient({
      stops: [
        { offset: 0, color: [0, 0, 0, 1] },
        { offset: Number.NaN, color: [255, 255, 255, 1] },
      ],
    });

    expect(gradient).toBeUndefined();
  });

  test('drops a non-finite angle but keeps the stops', () => {
    const gradient = jsonToGradient({
      stops: [
        { offset: 0, color: [0, 0, 0, 1] },
        { offset: 1, color: [255, 255, 255, 1] },
      ],
      angle: Number.POSITIVE_INFINITY,
    });

    expect(gradient?.angle).toBeUndefined();
    expect(gradient?.stops).toHaveLength(2);
  });
});
