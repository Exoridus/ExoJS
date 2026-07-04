import type { EasingFunction } from '#animation/Easing';
import { Ease } from '#animation/Easing';

const EPSILON = 1e-10;

const allFunctions: Array<[string, EasingFunction]> = Object.entries(Ease) as Array<[string, EasingFunction]>;

describe('Easing', () => {
  describe('boundary conditions: f(0) === 0 and f(1) === 1', () => {
    test.each(allFunctions)('%s returns 0 at t=0', (_name, fn) => {
      expect(Math.abs(fn(0))).toBeLessThanOrEqual(EPSILON);
    });

    test.each(allFunctions)('%s returns 1 at t=1', (_name, fn) => {
      expect(Math.abs(fn(1) - 1)).toBeLessThanOrEqual(EPSILON);
    });
  });

  describe('linear', () => {
    test('f(0.5) === 0.5', () => {
      expect(Ease.linear(0.5)).toBe(0.5);
    });

    test('f(0.25) === 0.25', () => {
      expect(Ease.linear(0.25)).toBe(0.25);
    });
  });

  describe('quadIn', () => {
    test('f(0.5) ≈ 0.25', () => {
      expect(Ease.quadIn(0.5)).toBeCloseTo(0.25, 10);
    });
  });

  describe('quadOut', () => {
    test('f(0.5) ≈ 0.75', () => {
      expect(Ease.quadOut(0.5)).toBeCloseTo(0.75, 10);
    });
  });

  describe('quadInOut', () => {
    test('f(0.25) ≈ 0.125', () => {
      expect(Ease.quadInOut(0.25)).toBeCloseTo(0.125, 10);
    });

    test('f(0.75) ≈ 0.875', () => {
      expect(Ease.quadInOut(0.75)).toBeCloseTo(0.875, 10);
    });
  });

  describe('cubicIn', () => {
    test('f(0.5) ≈ 0.125', () => {
      expect(Ease.cubicIn(0.5)).toBeCloseTo(0.125, 10);
    });
  });

  describe('cubicOut', () => {
    test('f(0.5) ≈ 0.875', () => {
      expect(Ease.cubicOut(0.5)).toBeCloseTo(0.875, 10);
    });
  });

  describe('cubicInOut', () => {
    test('f(0.25) ≈ 0.0625', () => {
      // 4 * 0.25^3 = 4 * 0.015625 = 0.0625
      expect(Ease.cubicInOut(0.25)).toBeCloseTo(0.0625, 8);
    });
  });

  describe('quartIn', () => {
    test('f(0.5) ≈ 0.0625', () => {
      expect(Ease.quartIn(0.5)).toBeCloseTo(0.0625, 10);
    });
  });

  describe('quartOut', () => {
    test('f(0.5) ≈ 0.9375', () => {
      expect(Ease.quartOut(0.5)).toBeCloseTo(0.9375, 10);
    });
  });

  describe('quintIn', () => {
    test('f(0.5) ≈ 0.03125', () => {
      expect(Ease.quintIn(0.5)).toBeCloseTo(0.03125, 10);
    });
  });

  describe('quintOut', () => {
    test('f(0.5) ≈ 0.96875', () => {
      expect(Ease.quintOut(0.5)).toBeCloseTo(0.96875, 10);
    });
  });

  describe('sineIn', () => {
    test('f(0.5) ≈ 0.2929', () => {
      expect(Ease.sineIn(0.5)).toBeCloseTo(1 - Math.cos(Math.PI / 4), 10);
    });
  });

  describe('sineOut', () => {
    test('f(0.5) ≈ 0.7071', () => {
      expect(Ease.sineOut(0.5)).toBeCloseTo(Math.sin(Math.PI / 4), 10);
    });
  });

  describe('sineInOut', () => {
    test('f(0.5) ≈ 0.5', () => {
      expect(Ease.sineInOut(0.5)).toBeCloseTo(0.5, 10);
    });
  });

  describe('expoIn', () => {
    test('f(0) === 0 (edge case)', () => {
      expect(Ease.expoIn(0)).toBe(0);
    });

    test('f(0.5) ≈ 0.03125', () => {
      expect(Ease.expoIn(0.5)).toBeCloseTo(Math.pow(2, -5), 10);
    });
  });

  describe('expoOut', () => {
    test('f(1) === 1 (edge case)', () => {
      expect(Ease.expoOut(1)).toBe(1);
    });

    test('f(0.5) ≈ 0.96875', () => {
      expect(Ease.expoOut(0.5)).toBeCloseTo(1 - Math.pow(2, -5), 10);
    });
  });

  describe('expoInOut', () => {
    test('f(0) === 0 (edge case)', () => {
      expect(Ease.expoInOut(0)).toBe(0);
    });

    test('f(1) === 1 (edge case)', () => {
      expect(Ease.expoInOut(1)).toBe(1);
    });

    test('f(0.5) ≈ 0.5', () => {
      expect(Ease.expoInOut(0.5)).toBeCloseTo(0.5, 10);
    });

    test('f(0.25) uses the t<0.5 branch formula', () => {
      expect(Ease.expoInOut(0.25)).toBeCloseTo(Math.pow(2, 20 * 0.25 - 10) / 2, 10);
    });
  });

  describe('circIn', () => {
    test('f(0.5) ≈ 0.134', () => {
      expect(Ease.circIn(0.5)).toBeCloseTo(1 - Math.sqrt(0.75), 10);
    });
  });

  describe('circOut', () => {
    test('f(0.5) ≈ 0.866', () => {
      expect(Ease.circOut(0.5)).toBeCloseTo(Math.sqrt(0.75), 10);
    });
  });

  describe('circInOut', () => {
    test('f(0.5) ≈ 0.5', () => {
      expect(Ease.circInOut(0.5)).toBeCloseTo(0.5, 10);
    });
  });

  describe('backIn', () => {
    test('can go below 0 at midpoint (back overshoot)', () => {
      // backIn is designed to go negative before rising
      expect(Ease.backIn(0.3)).toBeLessThan(0);
    });
  });

  describe('backOut', () => {
    test('can exceed 1 at midpoint (back overshoot)', () => {
      expect(Ease.backOut(0.7)).toBeGreaterThan(1);
    });
  });

  describe('backInOut', () => {
    test('f(0.5) ≈ 0.5', () => {
      expect(Ease.backInOut(0.5)).toBeCloseTo(0.5, 5);
    });
  });

  describe('bounceOut', () => {
    test('f(0.5) > 0.5 (already past the first bounce peak)', () => {
      expect(Ease.bounceOut(0.5)).toBeGreaterThan(0.5);
    });

    test('f(0.8) hits the third bounce segment (t in [2/d1, 2.5/d1))', () => {
      // d1 = 2.75; 2/d1 ≈ 0.727, 2.5/d1 ≈ 0.909 — 0.8 falls in that range,
      // which none of the other bounce tests exercise.
      expect(Ease.bounceOut(0.8)).toBeCloseTo(0.94, 3);
    });
  });

  describe('bounceIn', () => {
    test('mirrors bounceOut: f(0.5) < 0.5', () => {
      expect(Ease.bounceIn(0.5)).toBeLessThan(0.5);
    });
  });

  describe('bounceInOut', () => {
    test('f(0.5) ≈ 0.5', () => {
      expect(Ease.bounceInOut(0.5)).toBeCloseTo(0.5, 5);
    });
  });

  describe('elasticIn', () => {
    test('f(0) === 0 (edge case)', () => {
      expect(Ease.elasticIn(0)).toBe(0);
    });

    test('f(1) === 1 (edge case)', () => {
      expect(Ease.elasticIn(1)).toBe(1);
    });

    test('f(0.5) matches the elastic formula (mid-range, exercises the c4 branch)', () => {
      // Neither 0 nor 1, so this reaches the c4 computation and the actual
      // oscillating formula, which the edge-case-only tests above never do.
      const c4 = (2 * Math.PI) / 3;
      const expected = -Math.pow(2, 10 * 0.5 - 10) * Math.sin((0.5 * 10 - 10.75) * c4);
      expect(Ease.elasticIn(0.5)).toBeCloseTo(expected, 10);
    });
  });

  describe('elasticOut', () => {
    test('f(0) === 0 (edge case)', () => {
      expect(Ease.elasticOut(0)).toBe(0);
    });

    test('f(1) === 1 (edge case)', () => {
      expect(Ease.elasticOut(1)).toBe(1);
    });

    test('f(0.5) matches the elastic formula (mid-range, exercises the c4 branch)', () => {
      const c4 = (2 * Math.PI) / 3;
      const expected = Math.pow(2, -10 * 0.5) * Math.sin((0.5 * 10 - 0.75) * c4) + 1;
      expect(Ease.elasticOut(0.5)).toBeCloseTo(expected, 10);
    });
  });

  describe('elasticInOut', () => {
    test('f(0) === 0 (edge case)', () => {
      expect(Ease.elasticInOut(0)).toBe(0);
    });

    test('f(1) === 1 (edge case)', () => {
      expect(Ease.elasticInOut(1)).toBe(1);
    });

    test('f(0.5) ≈ 0.5', () => {
      expect(Ease.elasticInOut(0.5)).toBeCloseTo(0.5, 5);
    });

    test('f(0.25) uses the t<0.5 branch formula', () => {
      const c5 = (2 * Math.PI) / 4.5;
      const expected = -(Math.pow(2, 20 * 0.25 - 10) * Math.sin((20 * 0.25 - 11.125) * c5)) / 2;
      expect(Ease.elasticInOut(0.25)).toBeCloseTo(expected, 10);
    });
  });
});
