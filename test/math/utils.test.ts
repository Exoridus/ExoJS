import {
  bezierCurveTo,
  clamp,
  DEGREES_PER_RADIAN,
  degreesToRadians,
  getDistance,
  getVoronoiRegion,
  inRange,
  isPowerOfTwo,
  lerp,
  MathUtils,
  quadraticCurveTo,
  RADIANS_PER_DEGREE,
  radiansToDegrees,
  sign,
  TAU,
  trimRotation,
  VoronoiRegion,
} from '#math/utils';
import { Vector } from '#math/Vector';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('constants', () => {
  test('TAU is 2*PI', () => {
    expect(TAU).toBeCloseTo(Math.PI * 2);
  });

  test('RADIANS_PER_DEGREE / DEGREES_PER_RADIAN are inverse factors', () => {
    expect(RADIANS_PER_DEGREE * DEGREES_PER_RADIAN).toBeCloseTo(1);
  });
});

// ---------------------------------------------------------------------------
// trimRotation
// ---------------------------------------------------------------------------

describe('trimRotation', () => {
  test('a value already in [0, 360) is unchanged', () => {
    expect(trimRotation(45)).toBe(45);
  });

  test('a value >= 360 wraps into range', () => {
    expect(trimRotation(400)).toBe(40);
  });

  test('a negative value wraps into the positive range', () => {
    expect(trimRotation(-90)).toBe(270);
  });

  test('exactly 360 wraps to 0', () => {
    expect(trimRotation(360)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// degreesToRadians / radiansToDegrees
// ---------------------------------------------------------------------------

describe('degreesToRadians', () => {
  test('180 degrees is PI radians', () => {
    expect(degreesToRadians(180)).toBeCloseTo(Math.PI);
  });

  test('0 degrees is 0 radians', () => {
    expect(degreesToRadians(0)).toBe(0);
  });
});

describe('radiansToDegrees', () => {
  test('PI radians is 180 degrees', () => {
    expect(radiansToDegrees(Math.PI)).toBeCloseTo(180);
  });

  test('0 radians is 0 degrees', () => {
    expect(radiansToDegrees(0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// clamp
// ---------------------------------------------------------------------------

describe('clamp', () => {
  test('value within range is unchanged', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  test('value below min is clamped to min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  test('value above max is clamped to max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// sign
// ---------------------------------------------------------------------------

describe('sign', () => {
  test('positive value returns 1', () => {
    expect(sign(5)).toBe(1);
  });

  test('negative value returns -1', () => {
    expect(sign(-5)).toBe(-1);
  });

  test('strict zero returns 0', () => {
    expect(sign(0)).toBe(0);
  });

  test('negative zero short-circuits through the falsy `value &&` guard (stays -0, not -1)', () => {
    // `value && (value < 0 ? -1 : 1)` short-circuits on any falsy `value`
    // (0 or -0) and returns that value as-is, rather than -1 or 1.
    expect(Object.is(sign(-0), -0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// lerp
// ---------------------------------------------------------------------------

describe('lerp', () => {
  test('ratio 0 returns the start value', () => {
    expect(lerp(10, 20, 0)).toBe(10);
  });

  test('ratio 1 returns the end value', () => {
    expect(lerp(10, 20, 1)).toBe(20);
  });

  test('ratio 0.5 returns the midpoint', () => {
    expect(lerp(10, 20, 0.5)).toBeCloseTo(15);
  });
});

// ---------------------------------------------------------------------------
// isPowerOfTwo
// ---------------------------------------------------------------------------

describe('isPowerOfTwo', () => {
  test('powers of two return true', () => {
    expect(isPowerOfTwo(1)).toBe(true);
    expect(isPowerOfTwo(2)).toBe(true);
    expect(isPowerOfTwo(1024)).toBe(true);
  });

  test('non-powers of two return false', () => {
    expect(isPowerOfTwo(3)).toBe(false);
    expect(isPowerOfTwo(100)).toBe(false);
  });

  test('zero returns false', () => {
    expect(isPowerOfTwo(0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// inRange
// ---------------------------------------------------------------------------

describe('inRange', () => {
  test('value within [min, max] returns true', () => {
    expect(inRange(5, 0, 10)).toBe(true);
  });

  test('value outside [min, max] returns false', () => {
    expect(inRange(50, 0, 10)).toBe(false);
  });

  test('works when min > max (reversed bounds)', () => {
    expect(inRange(5, 10, 0)).toBe(true);
    expect(inRange(50, 10, 0)).toBe(false);
  });

  test('boundary values are inclusive', () => {
    expect(inRange(0, 0, 10)).toBe(true);
    expect(inRange(10, 0, 10)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getDistance
// ---------------------------------------------------------------------------

describe('getDistance', () => {
  test('computes the Euclidean distance between two points', () => {
    expect(getDistance(0, 0, 3, 4)).toBe(5);
  });

  test('distance between identical points is 0', () => {
    expect(getDistance(1, 1, 1, 1)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// bezierCurveTo
// ---------------------------------------------------------------------------

describe('bezierCurveTo', () => {
  test('pushes the starting point first, then len samples (default len=20)', () => {
    const path = bezierCurveTo(0, 0, 5, 10, 15, 10, 20, 0);

    // 1 start point + 20 sampled points = 21 (x, y) pairs.
    expect(path.length).toBe(21 * 2);
    expect(path[0]).toBe(0);
    expect(path[1]).toBe(0);
  });

  test('the final sampled point matches the curve endpoint', () => {
    const path = bezierCurveTo(0, 0, 5, 10, 15, 10, 20, 0);

    expect(path[path.length - 2]).toBeCloseTo(20);
    expect(path[path.length - 1]).toBeCloseTo(0);
  });

  test('appends to a provided path array instead of creating a new one', () => {
    const existing = [1, 2];
    const path = bezierCurveTo(0, 0, 5, 10, 15, 10, 20, 0, existing, 5);

    expect(path).toBe(existing);
    expect(path[0]).toBe(1);
    expect(path[1]).toBe(2);
    // 2 existing + 1 start pair (2) + 5 sampled pairs (10) = 14 values.
    expect(path.length).toBe(14);
  });

  test('respects a custom sample count', () => {
    const path = bezierCurveTo(0, 0, 5, 10, 15, 10, 20, 0, [], 4);

    // 1 start + 4 samples = 5 pairs.
    expect(path.length).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// quadraticCurveTo
// ---------------------------------------------------------------------------

describe('quadraticCurveTo', () => {
  test('produces len + 1 samples (default len=20), including both endpoints', () => {
    const path = quadraticCurveTo(0, 0, 10, 10, 20, 0);

    // 21 (x, y) pairs.
    expect(path.length).toBe(21 * 2);
    expect(path[0]).toBeCloseTo(0);
    expect(path[1]).toBeCloseTo(0);
    expect(path[path.length - 2]).toBeCloseTo(20);
    expect(path[path.length - 1]).toBeCloseTo(0);
  });

  test('appends to a provided path array instead of creating a new one', () => {
    const existing = [7, 8];
    const path = quadraticCurveTo(0, 0, 10, 10, 20, 0, existing, 4);

    expect(path).toBe(existing);
    expect(path[0]).toBe(7);
    expect(path[1]).toBe(8);
    // 2 existing + 5 pairs (len+1=5) = 12 values.
    expect(path.length).toBe(12);
  });

  test('respects a custom sample count', () => {
    const path = quadraticCurveTo(0, 0, 10, 10, 20, 0, [], 2);

    // len + 1 = 3 pairs.
    expect(path.length).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// getVoronoiRegion
// ---------------------------------------------------------------------------

describe('getVoronoiRegion', () => {
  test('point before the line start classifies as left', () => {
    const line = new Vector(10, 0);
    const point = new Vector(-5, 0);

    expect(getVoronoiRegion(line, point)).toBe(VoronoiRegion.left);

    line.destroy();
    point.destroy();
  });

  test('point past the line end classifies as right', () => {
    const line = new Vector(10, 0);
    const point = new Vector(20, 0);

    expect(getVoronoiRegion(line, point)).toBe(VoronoiRegion.right);

    line.destroy();
    point.destroy();
  });

  test('point projecting onto the segment classifies as middle', () => {
    const line = new Vector(10, 0);
    const point = new Vector(5, 3);

    expect(getVoronoiRegion(line, point)).toBe(VoronoiRegion.middle);

    line.destroy();
    point.destroy();
  });
});

// ---------------------------------------------------------------------------
// MathUtils facade
// ---------------------------------------------------------------------------

describe('MathUtils', () => {
  test('exposes the angle/curve/geometry helpers by reference', () => {
    expect(MathUtils.distance).toBe(getDistance);
    expect(MathUtils.trimRotation).toBe(trimRotation);
    expect(MathUtils.degreesToRadians).toBe(degreesToRadians);
    expect(MathUtils.radiansToDegrees).toBe(radiansToDegrees);
    expect(MathUtils.bezierCurveTo).toBe(bezierCurveTo);
    expect(MathUtils.quadraticCurveTo).toBe(quadraticCurveTo);
  });
});
