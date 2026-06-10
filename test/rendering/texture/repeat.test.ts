import type { RepeatFit, RepeatMode, RepeatPlan } from '#rendering/texture/repeat';
import { planRepeat } from '#rendering/texture/repeat';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Helper: assert that the last segment's destination end equals the total
 * destination length (within tolerance).
 */
function expectExactDestinationBoundary(plan: RepeatPlan, destinationLength: number): void {
  if (plan.segments.length > 0) {
    const last = plan.segments[plan.segments.length - 1];
    const end = last.destinationStart + last.destinationLength;
    expect(end).toBeCloseTo(destinationLength, 10);
  } else {
    expect(plan.destinationLength).toBe(0);
    expect(destinationLength).toBe(0);
  }
}

/**
 * Helper: assert that segments are contiguous and non-overlapping.
 */
function expectContiguous(plan: RepeatPlan): void {
  for (let i = 1; i < plan.segments.length; i++) {
    const prev = plan.segments[i - 1];
    const curr = plan.segments[i];
    expect(curr.destinationStart).toBeCloseTo(prev.destinationStart + prev.destinationLength, 10);
  }
}

// =============================================================================
// Stretch mode
// =============================================================================

describe('RepeatPlanner — stretch', () => {
  test('fills destination once', () => {
    const plan = planRepeat(16, 100, 'stretch');
    expect(plan.segments.length).toBe(1);
    expect(plan.segments[0].destinationStart).toBe(0);
    expect(plan.segments[0].destinationLength).toBe(100);
  });

  test('full source interval for stretch', () => {
    const plan = planRepeat(64, 200, 'stretch');
    expect(plan.segments[0].sourceStart).toBe(0);
    expect(plan.segments[0].sourceEnd).toBe(1);
    expect(plan.segments[0].mirrored).toBe(false);
  });

  test('destination smaller than source — still one stretched segment', () => {
    const plan = planRepeat(64, 10, 'stretch');
    expect(plan.segments.length).toBe(1);
    expect(plan.segments[0].destinationLength).toBe(10);
    expect(plan.segments[0].sourceStart).toBe(0);
    expect(plan.segments[0].sourceEnd).toBe(1);
  });

  test('destination larger than source', () => {
    const plan = planRepeat(10, 500, 'stretch');
    expect(plan.segments.length).toBe(1);
    expect(plan.segments[0].destinationLength).toBe(500);
  });

  test('fit parameter is ignored for stretch', () => {
    const planClip = planRepeat(16, 100, 'stretch', 'clip');
    const planRound = planRepeat(16, 100, 'stretch', 'round');
    expect(planClip).toEqual(planRound);
  });

  test('stretch with zero destination', () => {
    const plan = planRepeat(16, 0, 'stretch');
    expect(plan.destinationLength).toBe(0);
    expect(plan.segments.length).toBe(0);
  });
});

// =============================================================================
// Repeat + clip
// =============================================================================

describe('RepeatPlanner — repeat + clip', () => {
  test('exact multiple — no clipped final segment', () => {
    const plan = planRepeat(16, 48, 'repeat', 'clip');
    expect(plan.segments.length).toBe(3);
    plan.segments.forEach(s => {
      expect(s.destinationLength).toBe(16);
      expect(s.sourceStart).toBe(0);
      expect(s.sourceEnd).toBe(1);
      expect(s.mirrored).toBe(false);
    });
  });

  test('partial final segment', () => {
    const plan = planRepeat(16, 40, 'repeat', 'clip');
    expect(plan.segments.length).toBe(3);
    // First two: full
    expect(plan.segments[0].destinationStart).toBe(0);
    expect(plan.segments[0].destinationLength).toBe(16);
    expect(plan.segments[0].sourceEnd).toBe(1);

    expect(plan.segments[1].destinationStart).toBe(16);
    expect(plan.segments[1].destinationLength).toBe(16);
    expect(plan.segments[1].sourceEnd).toBe(1);

    // Final: clipped
    expect(plan.segments[2].destinationStart).toBe(32);
    expect(plan.segments[2].destinationLength).toBe(8);
    expect(plan.segments[2].sourceStart).toBe(0);
    expect(plan.segments[2].sourceEnd).toBe(0.5);
  });

  test('correct source fraction for clipped final segment', () => {
    const plan = planRepeat(10, 25, 'repeat', 'clip');
    // 10 + 10 + 5 → source fraction for last = 5/10 = 0.5
    expect(plan.segments.length).toBe(3);
    expect(plan.segments[2].sourceEnd).toBe(0.5);
  });

  test('destination smaller than source — one clipped segment', () => {
    const plan = planRepeat(64, 10, 'repeat', 'clip');
    expect(plan.segments.length).toBe(1);
    expect(plan.segments[0].destinationStart).toBe(0);
    expect(plan.segments[0].destinationLength).toBe(10);
    expect(plan.segments[0].sourceStart).toBe(0);
    expect(plan.segments[0].sourceEnd).toBe(10 / 64);
  });

  test('destination exactly one source length', () => {
    const plan = planRepeat(32, 32, 'repeat', 'clip');
    expect(plan.segments.length).toBe(1);
    expect(plan.segments[0].destinationLength).toBe(32);
    expect(plan.segments[0].sourceEnd).toBe(1);
  });

  test('zero destination returns empty plan', () => {
    const plan = planRepeat(16, 0, 'repeat', 'clip');
    expect(plan.segments.length).toBe(0);
    expect(plan.destinationLength).toBe(0);
  });
});

// =============================================================================
// Repeat + round
// =============================================================================

describe('RepeatPlanner — repeat + round', () => {
  test('exact multiple — no distortion', () => {
    const plan = planRepeat(16, 48, 'repeat', 'round');
    // ratio = 3.0 → count = 3, segment = 16
    expect(plan.segments.length).toBe(3);
    plan.segments.forEach(s => {
      expect(s.destinationLength).toBe(16);
      expect(s.mirrored).toBe(false);
    });
    expectExactDestinationBoundary(plan, 48);
  });

  test('ratio below 1 — one complete segment stretched to destination', () => {
    const plan = planRepeat(64, 10, 'repeat', 'round');
    // ratio = 10/64 ≈ 0.156 → round = 0 → clamp to 1
    expect(plan.segments.length).toBe(1);
    expect(plan.segments[0].destinationLength).toBe(10);
    expectExactDestinationBoundary(plan, 10);
  });

  test('non-integer ratio (2.5 → round to 3)', () => {
    const plan = planRepeat(16, 40, 'repeat', 'round');
    // ratio = 40/16 = 2.5 → Math.round(2.5) = 3
    expect(plan.segments.length).toBe(3);

    const segLen = 40 / 3;
    plan.segments.forEach(s => {
      expect(s.destinationLength).toBeCloseTo(segLen, 10);
    });
    expectExactDestinationBoundary(plan, 40);
  });

  test('equal segment lengths in round mode', () => {
    const plan = planRepeat(10, 27, 'repeat', 'round');
    // ratio = 27/10 = 2.7 → round = 3
    const expected = 27 / 3;
    plan.segments.forEach(s => {
      expect(s.destinationLength).toBeCloseTo(expected, 10);
    });
  });

  test('half-case rounding (ratio = 1.5 → 2)', () => {
    const plan = planRepeat(10, 15, 'repeat', 'round');
    // ratio = 1.5 → round = 2
    expect(plan.segments.length).toBe(2);
    expect(plan.segments[0].destinationLength).toBe(7.5);
    expectExactDestinationBoundary(plan, 15);
  });

  test('round with exact boundary', () => {
    const plan = planRepeat(7, 20, 'repeat', 'round');
    // ratio = 20/7 ≈ 2.857 → round = 3
    expect(plan.segments.length).toBe(3);
    expectExactDestinationBoundary(plan, 20);
  });

  test('zero destination returns empty plan', () => {
    const plan = planRepeat(16, 0, 'repeat', 'round');
    expect(plan.segments.length).toBe(0);
  });
});

// =============================================================================
// Mirror repeat — clip
// =============================================================================

describe('RepeatPlanner — mirror-repeat + clip', () => {
  test('orientation sequence: segment 0 normal, segment 1 mirrored', () => {
    const plan = planRepeat(16, 48, 'mirror-repeat', 'clip');
    expect(plan.segments.length).toBe(3);

    expect(plan.segments[0].mirrored).toBe(false);
    expect(plan.segments[0].sourceStart).toBe(0);
    expect(plan.segments[0].sourceEnd).toBe(1);

    expect(plan.segments[1].mirrored).toBe(true);
    expect(plan.segments[1].sourceStart).toBe(1);
    expect(plan.segments[1].sourceEnd).toBe(0);

    expect(plan.segments[2].mirrored).toBe(false);
    expect(plan.segments[2].sourceStart).toBe(0);
    expect(plan.segments[2].sourceEnd).toBe(1);
  });

  test('clipped final normal segment', () => {
    const plan = planRepeat(16, 40, 'mirror-repeat', 'clip');
    // segment 0: normal (full), segment 1: mirrored (full), segment 2: normal (clipped)
    expect(plan.segments.length).toBe(3);

    expect(plan.segments[0].mirrored).toBe(false);
    expect(plan.segments[0].sourceEnd).toBe(1);

    expect(plan.segments[1].mirrored).toBe(true);
    expect(plan.segments[1].sourceStart).toBe(1);
    expect(plan.segments[1].sourceEnd).toBe(0);

    expect(plan.segments[2].mirrored).toBe(false);
    expect(plan.segments[2].destinationLength).toBe(8);
    expect(plan.segments[2].sourceStart).toBe(0);
    expect(plan.segments[2].sourceEnd).toBe(0.5);
  });

  test('clipped final mirrored segment', () => {
    const plan = planRepeat(16, 24, 'mirror-repeat', 'clip');
    // 16 + 8 (clipped) → segment 0 normal, segment 1 mirrored clipped
    expect(plan.segments.length).toBe(2);

    expect(plan.segments[0].mirrored).toBe(false);
    expect(plan.segments[0].destinationLength).toBe(16);

    expect(plan.segments[1].mirrored).toBe(true);
    expect(plan.segments[1].destinationLength).toBe(8);
    // Mirrored clipped: source goes from 1 down to 0.5
    expect(plan.segments[1].sourceStart).toBe(1);
    expect(plan.segments[1].sourceEnd).toBe(0.5);
  });

  test('destination smaller than source — one clipped normal segment', () => {
    const plan = planRepeat(64, 10, 'mirror-repeat', 'clip');
    expect(plan.segments.length).toBe(1);
    expect(plan.segments[0].mirrored).toBe(false);
    expect(plan.segments[0].sourceStart).toBe(0);
    expect(plan.segments[0].sourceEnd).toBe(10 / 64);
  });
});

// =============================================================================
// Mirror repeat — round
// =============================================================================

describe('RepeatPlanner — mirror-repeat + round', () => {
  test('rounded mirrored sequence — all full segments', () => {
    const plan = planRepeat(16, 48, 'mirror-repeat', 'round');
    expect(plan.segments.length).toBe(3);

    expect(plan.segments[0].mirrored).toBe(false);
    expect(plan.segments[0].sourceStart).toBe(0);
    expect(plan.segments[0].sourceEnd).toBe(1);

    expect(plan.segments[1].mirrored).toBe(true);
    expect(plan.segments[1].sourceStart).toBe(1);
    expect(plan.segments[1].sourceEnd).toBe(0);

    expect(plan.segments[2].mirrored).toBe(false);
    expect(plan.segments[2].sourceStart).toBe(0);
    expect(plan.segments[2].sourceEnd).toBe(1);
  });

  test('mirror round with non-exact ratio', () => {
    const plan = planRepeat(10, 25, 'mirror-repeat', 'round');
    // ratio = 2.5 → 3 segments, each 25/3
    expect(plan.segments.length).toBe(3);

    expect(plan.segments[0].mirrored).toBe(false);
    expect(plan.segments[1].mirrored).toBe(true);
    expect(plan.segments[2].mirrored).toBe(false);

    // All full source intervals since round produces complete segments
    plan.segments.forEach(s => {
      if (s.mirrored) {
        expect(s.sourceStart).toBe(1);
        expect(s.sourceEnd).toBe(0);
      } else {
        expect(s.sourceStart).toBe(0);
        expect(s.sourceEnd).toBe(1);
      }
    });

    expectExactDestinationBoundary(plan, 25);
  });
});

// =============================================================================
// Validation
// =============================================================================

describe('RepeatPlanner — validation', () => {
  test('throws on zero source length', () => {
    expect(() => planRepeat(0, 100, 'repeat')).toThrow();
  });

  test('throws on negative source length', () => {
    expect(() => planRepeat(-5, 100, 'repeat')).toThrow();
  });

  test('throws on negative destination length', () => {
    expect(() => planRepeat(16, -10, 'repeat')).toThrow();
  });

  test('throws on NaN source length', () => {
    expect(() => planRepeat(NaN, 100, 'repeat')).toThrow();
  });

  test('throws on NaN destination length', () => {
    expect(() => planRepeat(16, NaN, 'repeat')).toThrow();
  });

  test('throws on Infinity source length', () => {
    expect(() => planRepeat(Infinity, 100, 'repeat')).toThrow();
  });

  test('throws on Infinity destination length', () => {
    expect(() => planRepeat(16, Infinity, 'repeat')).toThrow();
  });

  test('throws on -Infinity source length', () => {
    expect(() => planRepeat(-Infinity, 100, 'repeat')).toThrow();
  });

  test('throws on -Infinity destination length', () => {
    expect(() => planRepeat(16, -Infinity, 'repeat')).toThrow();
  });

  test('zero destination is valid for all modes', () => {
    for (const mode of ['stretch', 'repeat', 'mirror-repeat'] as RepeatMode[]) {
      const plan = planRepeat(16, 0, mode, 'clip');
      expect(plan.segments.length).toBe(0);
      expect(plan.destinationLength).toBe(0);
    }
  });
});

// =============================================================================
// Precision & boundary
// =============================================================================

describe('RepeatPlanner — precision & boundaries', () => {
  test('last segment ends at requested destination', () => {
    const plans = [
      planRepeat(16, 100, 'repeat', 'clip'),
      planRepeat(16, 100, 'repeat', 'round'),
      planRepeat(16, 100, 'mirror-repeat', 'clip'),
      planRepeat(16, 100, 'mirror-repeat', 'round'),
      planRepeat(16, 100, 'stretch'),
    ];

    for (const plan of plans) {
      expectExactDestinationBoundary(plan, 100);
    }
  });

  test('no accumulated drift in clip mode (many segments)', () => {
    // 100000 segments of length 1 each
    const plan = planRepeat(1, 100000, 'repeat', 'clip');
    expect(plan.segments.length).toBe(100000);
    const last = plan.segments[plan.segments.length - 1];
    expect(last.destinationStart + last.destinationLength).toBeCloseTo(100000, 10);
  });

  test('round mode derives boundaries from index * segmentLength', () => {
    // Check that each segment starts at i * segmentLength
    const plan = planRepeat(7, 100, 'repeat', 'round');
    for (let i = 0; i < plan.segments.length; i++) {
      expect(plan.segments[i].destinationStart).toBeCloseTo(i * plan.segments[i].destinationLength, 10);
    }
  });

  test('contiguous segments in all modes', () => {
    const source = 16;
    const dest = 83;

    for (const mode of ['stretch', 'repeat', 'mirror-repeat'] as RepeatMode[]) {
      for (const fit of ['clip', 'round'] as RepeatFit[]) {
        const plan = planRepeat(source, dest, mode, fit);
        expectContiguous(plan);
        expectExactDestinationBoundary(plan, dest);
      }
    }
  });

  test('very small source span does not divide by zero', () => {
    const plan = planRepeat(0.0001, 1, 'repeat', 'clip');
    expect(plan.segments.length).toBeGreaterThan(0);
    expectExactDestinationBoundary(plan, 1);
  });

  test('very small source span with round', () => {
    const plan = planRepeat(0.0001, 1, 'repeat', 'round');
    expect(plan.segments.length).toBeGreaterThan(0);
    expectExactDestinationBoundary(plan, 1);
  });

  test('very large segment count does not cause errors', () => {
    // source = 0.0001, dest = 1000 → ~10M segments
    // This is a stress test — the planner should be mathematically correct
    const plan = planRepeat(0.0001, 10, 'repeat', 'clip');
    expectExactDestinationBoundary(plan, 10);
  });
});

// =============================================================================
// Return value shape
// =============================================================================

describe('RepeatPlanner — return value', () => {
  test('plan records sourceLength from input', () => {
    const plan = planRepeat(42, 100, 'stretch');
    expect(plan.sourceLength).toBe(42);
  });

  test('plan records destinationLength from input', () => {
    const plan = planRepeat(16, 77, 'stretch');
    expect(plan.destinationLength).toBe(77);
  });

  test('segments are readonly', () => {
    const plan = planRepeat(16, 48, 'repeat', 'clip');
    expect(Array.isArray(plan.segments)).toBe(true);
    expect(plan.segments.length).toBe(3);
  });
});
