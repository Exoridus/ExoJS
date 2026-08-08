import { Vector } from '#math/Vector';

describe('Vector.contains is safe against the shared scratch', () => {
  test('contains on Vector.temp does not compare the scratch with itself', () => {
    Vector.temp.set(3, 4);

    // Routing the probe point through `Vector.temp` made this self-aliasing:
    // the receiver was overwritten with the probe and then measured against
    // itself, so every call on the scratch answered `true`.
    expect(Vector.temp.contains(99, 99)).toBe(false);
    expect(Vector.temp.contains(3, 4)).toBe(true);
  });

  test('contains leaves Vector.temp untouched', () => {
    Vector.temp.set(3, 4);

    new Vector(1, 2).contains(5, 6);

    expect(Vector.temp.x).toBe(3);
    expect(Vector.temp.y).toBe(4);
  });

  test('contains still answers plain point equality', () => {
    const vector = new Vector(7, -2);

    expect(vector.contains(7, -2)).toBe(true);
    expect(vector.contains(7, -2.0001)).toBe(false);
    expect(vector.contains(NaN, -2)).toBe(false);
  });
});
