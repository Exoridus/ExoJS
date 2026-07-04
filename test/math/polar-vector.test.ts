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
    // AbstractVector.angle and PolarVector.phi share the X-axis convention.
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

  test('fromVector()/toVector() round-trips an asymmetric vector', () => {
    const original = new Vector(3, 4);
    const roundTripped = PolarVector.fromVector(original).toVector();

    expect(roundTripped.x).toBeCloseTo(3);
    expect(roundTripped.y).toBeCloseTo(4);
  });

  test('fromVector()/toVector() round-trips the symmetric x === y case', () => {
    const original = new Vector(5, 5);
    const roundTripped = PolarVector.fromVector(original).toVector();

    expect(roundTripped.x).toBeCloseTo(original.x);
    expect(roundTripped.y).toBeCloseTo(original.y);
  });
});
