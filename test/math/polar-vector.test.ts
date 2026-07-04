import { PolarVector } from '#math/PolarVector';
import { Vector } from '#math/Vector';

describe('PolarVector construction', () => {
  test('defaults to radius 0, angle 0', () => {
    const p = new PolarVector();

    expect(p.radius).toBe(0);
    expect(p.phi).toBe(0);
  });

  test('accepts explicit radius and angle', () => {
    const p = new PolarVector(5, Math.PI / 2);

    expect(p.radius).toBe(5);
    expect(p.phi).toBe(Math.PI / 2);
  });
});

describe('PolarVector.fromVector()', () => {
  test('preserves magnitude and direction of the source vector', () => {
    const v = new Vector(3, 4);
    const p = PolarVector.fromVector(v);

    expect(p.radius).toBeCloseTo(v.length);
    // AbstractVector.angle is measured from the positive Y-axis, clockwise.
    expect(p.phi).toBeCloseTo(v.angle);
  });

  test('handles the zero vector', () => {
    const p = PolarVector.fromVector(new Vector(0, 0));

    expect(p.radius).toBe(0);
  });
});

describe('PolarVector.toVector()', () => {
  test('converts back to Cartesian coordinates', () => {
    const p = new PolarVector(5, 0);
    const v = p.toVector();

    expect(v.x).toBeCloseTo(5);
    expect(v.y).toBeCloseTo(0);
  });

  test('returns the shared Vector.temp instance', () => {
    const p = new PolarVector(1, 0);

    expect(p.toVector()).toBe(Vector.temp);
  });

  // BUG (see final report): the class doc comment claims
  // `PolarVector.fromVector(v).toVector()` reproduces `v` (modulo float
  // precision). It does not, for any vector where x !== y. `fromVector()`
  // stores `radius`/`phi` using `AbstractVector.angle`, which is measured from
  // the positive Y-axis: `phi = atan2(x, y)`. `toVector()` then reconstructs
  // Cartesian coordinates using the standard X-axis convention:
  // `x = radius*cos(phi)`, `y = radius*sin(phi)`. Mixing the two conventions
  // swaps the components instead of round-tripping them: for (3, 4) — length
  // 5, phi ≈ 0.6435 — `toVector()` yields (4, 3), not (3, 4).
  test('BUG: fromVector()/toVector() swaps x and y instead of round-tripping', () => {
    const original = new Vector(3, 4);
    const roundTripped = PolarVector.fromVector(original).toVector();

    // Documented/expected: roundTripped.x ≈ 3, roundTripped.y ≈ 4.
    expect(roundTripped.x).toBeCloseTo(4);
    expect(roundTripped.y).toBeCloseTo(3);
  });

  test('round-trips correctly on the symmetric x === y case (angle convention mismatch is masked)', () => {
    const original = new Vector(5, 5);
    const roundTripped = PolarVector.fromVector(original).toVector();

    expect(roundTripped.x).toBeCloseTo(original.x);
    expect(roundTripped.y).toBeCloseTo(original.y);
  });
});
