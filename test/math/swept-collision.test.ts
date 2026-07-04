import type { CircleLike } from '#math/CircleLike';
import { Rectangle } from '#math/Rectangle';
import { substepSweep, sweepCircleAgainst, sweepCircleVsCircle, sweepCircleVsRectangle, sweepRectangle, sweepRectangleAgainst } from '#math/swept-collision';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const rect = (x: number, y: number, w: number, h: number): Rectangle => new Rectangle(x, y, w, h);

const circle = (x: number, y: number, radius: number): CircleLike => ({ x, y, radius });

// ---------------------------------------------------------------------------
// sweepRectangle
// ---------------------------------------------------------------------------

describe('sweepRectangle', () => {
  test('identical AABBs at same position → t = 0 (already overlapping)', () => {
    const moving = rect(0, 0, 10, 10);
    const target = rect(0, 0, 10, 10);
    const hit = sweepRectangle(moving, 0, 0, target);

    expect(hit).not.toBeNull();
    expect(hit!.t).toBe(0);
  });

  test('moving box approaches static box from left, delta too small → null', () => {
    // moving: [0..10], target: [20..30]. Delta of 5 doesn't reach gap of 10.
    const moving = rect(0, 0, 10, 10);
    const target = rect(20, 0, 10, 10);
    const hit = sweepRectangle(moving, 5, 0, target);

    expect(hit).toBeNull();
  });

  test('moving box just barely touches static box → t === 1', () => {
    // moving: [0..10], target: [20..30]. Delta of 10 closes the gap exactly.
    const moving = rect(0, 0, 10, 10);
    const target = rect(20, 0, 10, 10);
    const hit = sweepRectangle(moving, 10, 0, target);

    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(1, 10);
  });

  test('high-speed tunneling → t < 1, normal points left (away from +X delta)', () => {
    // moving: [0..10], target: [20..30]. Delta of 100 would tunnel past.
    const moving = rect(0, 0, 10, 10);
    const target = rect(20, 0, 10, 10);
    const hit = sweepRectangle(moving, 100, 0, target);

    expect(hit).not.toBeNull();
    expect(hit!.t).toBeLessThan(1);
    expect(hit!.t).toBeCloseTo(10 / 100, 10); // (20-10)/100 = 0.1
    expect(hit!.normalX).toBe(-1);
    expect(hit!.normalY).toBe(0);
  });

  test('diagonal movement — X axis entered first → normal on X', () => {
    // moving at origin (10×10), target at (30, 5) (10×10).
    // X gap = 30 - 10 = 20, Y gap = 5 - 10 = -5 (already overlapping Y).
    // So X entry is the limiting axis.
    const moving = rect(0, 0, 10, 10);
    const target = rect(30, 5, 10, 10);
    const hit = sweepRectangle(moving, 40, 10, target);

    expect(hit).not.toBeNull();
    expect(hit!.normalX).toBe(-1); // hit on X face
    expect(hit!.normalY).toBe(0);
  });

  test('diagonal movement — Y axis entered last → normal on Y', () => {
    // X gap tiny, Y gap large — Y entry is latest.
    const moving = rect(0, 0, 10, 10);
    const target = rect(5, 30, 10, 10); // Y gap = 20, X already overlapping
    const hit = sweepRectangle(moving, 5, 40, target);

    expect(hit).not.toBeNull();
    expect(hit!.normalY).toBe(-1); // hit on Y face
    expect(hit!.normalX).toBe(0);
  });

  test('zero delta already overlapping → t = 0', () => {
    const moving = rect(5, 5, 10, 10);
    const target = rect(0, 0, 20, 20);
    const hit = sweepRectangle(moving, 0, 0, target);

    expect(hit).not.toBeNull();
    expect(hit!.t).toBe(0);
  });

  test('zero delta not overlapping → null', () => {
    const moving = rect(0, 0, 10, 10);
    const target = rect(50, 50, 10, 10);
    const hit = sweepRectangle(moving, 0, 0, target);

    expect(hit).toBeNull();
  });

  test('moving right, normal is -X', () => {
    const moving = rect(0, 0, 10, 10);
    const target = rect(15, 0, 10, 10);
    const hit = sweepRectangle(moving, 20, 0, target);

    expect(hit).not.toBeNull();
    expect(hit!.normalX).toBe(-1);
    expect(hit!.normalY).toBe(0);
  });

  test('moving left, normal is +X', () => {
    const moving = rect(50, 0, 10, 10);
    const target = rect(10, 0, 10, 10);
    const hit = sweepRectangle(moving, -30, 0, target);

    expect(hit).not.toBeNull();
    expect(hit!.normalX).toBe(1);
    expect(hit!.normalY).toBe(0);
  });

  test('hit position is correct', () => {
    // moving: [0..10], target: [20..30], delta = (20, 0) → tEntry = 0.5
    const moving = rect(0, 0, 10, 10);
    const target = rect(20, 0, 10, 10);
    const hit = sweepRectangle(moving, 20, 0, target);

    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(0.5, 10);
    expect(hit!.x).toBeCloseTo(10, 10); // 0 + 20 * 0.5
    expect(hit!.y).toBe(0);
  });

  test('moving box approaches static box from above (deltaY < 0)', () => {
    // moving: y in [20..30], target: y in [0..10]. Moving upward (negative Y).
    const moving = rect(0, 20, 10, 10);
    const target = rect(0, 0, 10, 10);
    const hit = sweepRectangle(moving, 0, -20, target);

    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(0.5, 10);
    expect(hit!.normalY).toBe(1);
  });

  test('no movement on Y and no static Y overlap → null', () => {
    // deltaY === 0 and the boxes never overlap on the Y axis, regardless of X.
    const moving = rect(0, 0, 10, 10);
    const target = rect(0, 100, 10, 10);
    const hit = sweepRectangle(moving, 5, 0, target);

    expect(hit).toBeNull();
  });

  test('already overlapping with a smaller X penetration picks normal via movMinX < tarMinX (-1)', () => {
    // moving straddles target's left edge → overlapX < overlapY, moving's min-X is left of target's.
    const moving = rect(-5, 0, 10, 20);
    const target = rect(0, 0, 20, 20);
    const hit = sweepRectangle(moving, 0, 0, target);

    expect(hit).not.toBeNull();
    expect(hit!.t).toBe(0);
    expect(hit!.normalX).toBe(-1);
    expect(hit!.normalY).toBe(0);
  });

  test('already overlapping with a smaller X penetration picks normal via movMinX >= tarMinX (+1)', () => {
    // moving straddles target's right edge → overlapX < overlapY, moving's min-X is right of target's.
    const moving = rect(15, 0, 10, 20);
    const target = rect(0, 0, 20, 20);
    const hit = sweepRectangle(moving, 0, 0, target);

    expect(hit).not.toBeNull();
    expect(hit!.t).toBe(0);
    expect(hit!.normalX).toBe(1);
    expect(hit!.normalY).toBe(0);
  });

  test('already overlapping with a smaller Y penetration picks normal via movMinY < tarMinY (-1)', () => {
    // moving straddles target's top edge → overlapY < overlapX, moving's min-Y is above target's.
    const moving = rect(0, -5, 20, 10);
    const target = rect(0, 0, 20, 20);
    const hit = sweepRectangle(moving, 0, 0, target);

    expect(hit).not.toBeNull();
    expect(hit!.t).toBe(0);
    expect(hit!.normalX).toBe(0);
    expect(hit!.normalY).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// sweepCircleVsCircle
// ---------------------------------------------------------------------------

describe('sweepCircleVsCircle', () => {
  test('two circles at same position → t = 0', () => {
    const moving = circle(0, 0, 5);
    const target = circle(0, 0, 5);
    const hit = sweepCircleVsCircle(moving, 0, 0, target);

    expect(hit).not.toBeNull();
    expect(hit!.t).toBe(0);
  });

  test('already overlapping but not coincident computes a real (dist > 0) normal', () => {
    // distance (3) < combined radius (10), and the centres are offset — unlike
    // the coincident-centre case above, this exercises the dist > 0 branch.
    const moving = circle(0, 0, 5);
    const target = circle(3, 0, 5);
    const hit = sweepCircleVsCircle(moving, 0, 0, target);

    expect(hit).not.toBeNull();
    expect(hit!.t).toBe(0);
    // dx = moving.x - target.x = 0 - 3 = -3, dist = 3 > 0 → normal = dx/dist = -1.
    expect(hit!.normalX).toBeCloseTo(-1);
    expect(hit!.normalY).toBeCloseTo(0);
  });

  test('circle approaches on collision course → correct t', () => {
    // moving circle centre at (0,0) r=5, target at (20,0) r=5, combined r=10
    // delta = (20, 0). Entry at distance = 20 - 10 = 10, t = 10/20 = 0.5
    const moving = circle(0, 0, 5);
    const target = circle(20, 0, 5);
    const hit = sweepCircleVsCircle(moving, 20, 0, target);

    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(0.5, 5);
  });

  test('circle moves perpendicular with sufficient separation → null', () => {
    // moving at (0, 0) r=1, target at (100, 0) r=1. Moving straight up.
    const moving = circle(0, 0, 1);
    const target = circle(100, 0, 1);
    const hit = sweepCircleVsCircle(moving, 0, 100, target);

    expect(hit).toBeNull();
  });

  test('high-speed tunneling → t < 1', () => {
    // moving at (0,0) r=2, target at (50,0) r=2. Combined r=4.
    // Entry at 50-4=46, delta=1000 → t = 46/1000 = 0.046
    const moving = circle(0, 0, 2);
    const target = circle(50, 0, 2);
    const hit = sweepCircleVsCircle(moving, 1000, 0, target);

    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(46 / 1000, 5);
  });

  test('discriminant exactly 0 (grazing tangent) → t valid', () => {
    // moving at (0, 2) r=1, target at (10, 0) r=1.
    // Moving directly in +X: dx offset of 2 = sum of radii → tangent.
    // combined r = 2, the circle at y=2 grazes the circle at y=0 when
    // lateral separation = 2 (the combined radius). Moving exactly in +X.
    const moving = circle(0, 2, 1);
    const target = circle(10, 0, 1);
    const hit = sweepCircleVsCircle(moving, 20, 0, target);

    // disc = 0 → exactly one touch point
    expect(hit).not.toBeNull();
    expect(hit!.t).toBeGreaterThanOrEqual(0);
    expect(hit!.t).toBeLessThanOrEqual(1);
  });

  test('normal points from target centre toward hit circle centre', () => {
    const moving = circle(0, 0, 5);
    const target = circle(20, 0, 5);
    const hit = sweepCircleVsCircle(moving, 20, 0, target);

    expect(hit).not.toBeNull();
    // At impact the hit centre is at (10-epsilon, 0).  normal should point in -X direction.
    expect(hit!.normalX).toBeCloseTo(-1, 5);
    expect(hit!.normalY).toBeCloseTo(0, 5);
  });

  test('no movement, no overlap → null', () => {
    const moving = circle(0, 0, 2);
    const target = circle(10, 0, 2);
    const hit = sweepCircleVsCircle(moving, 0, 0, target);

    expect(hit).toBeNull();
  });

  test('moving toward the target, but not far enough to ever reach it → t > 1 → null', () => {
    // combined radius = 4, gap = 100 - 4 = 96; delta of 10 only covers t = 9.6.
    const moving = circle(0, 0, 2);
    const target = circle(100, 0, 2);
    const hit = sweepCircleVsCircle(moving, 10, 0, target);

    expect(hit).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// sweepCircleVsRectangle
// ---------------------------------------------------------------------------

describe('sweepCircleVsRectangle', () => {
  test('circle approaching rect face head-on → hit detected', () => {
    // circle at (-5, 5) r=5, rect at [10..20, 0..10]. Delta = (20, 0).
    // Expanded rect = [5..25, -5..15]. Circle centre starts at x=-5.
    // Entry on X: (5 - (-5)) / 20 = 10/20 = 0.5
    const moving = circle(-5, 5, 5);
    const target = rect(10, 0, 10, 10);
    const hit = sweepCircleVsRectangle(moving, 20, 0, target);

    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(0.5, 5);
  });

  test('already overlapping → t = 0', () => {
    const moving = circle(15, 5, 5);
    const target = rect(10, 0, 10, 10);
    const hit = sweepCircleVsRectangle(moving, 0, 0, target);

    expect(hit).not.toBeNull();
    expect(hit!.t).toBe(0);
  });

  test('circle moving past corner — hit returned (v1 flat-face expansion)', () => {
    // Circle above-right of the top-right corner, moving diagonally into it.
    // V1 expanded-rect will still detect a hit.
    const moving = circle(30, -10, 5);
    const target = rect(0, 0, 20, 20);
    const hit = sweepCircleVsRectangle(moving, -50, 50, target);

    // V1: at minimum a hit is detected (might be slightly early due to corner expansion)
    expect(hit).not.toBeNull();
    expect(hit!.t).toBeGreaterThanOrEqual(0);
    expect(hit!.t).toBeLessThanOrEqual(1);
  });

  test('circle far away moving away → null', () => {
    const moving = circle(-100, 5, 5);
    const target = rect(10, 0, 10, 10);
    const hit = sweepCircleVsRectangle(moving, -50, 0, target);

    expect(hit).toBeNull();
  });

  test('already overlapping from outside the rect (dist > 0 branch)', () => {
    // Circle centred to the right of the rect's right edge, close enough that
    // its boundary already overlaps — the closest rect point is not the
    // circle's own centre, so `dist > 0`.
    const moving = circle(25, 5, 6);
    const target = rect(0, 0, 20, 10);
    const hit = sweepCircleVsRectangle(moving, 0, 0, target);

    expect(hit).not.toBeNull();
    expect(hit!.t).toBe(0);
    expect(hit!.normalX).toBeCloseTo(1);
    expect(hit!.normalY).toBeCloseTo(0);
  });

  test('circle centre inside the rect picks the Y exit axis when it is the smaller penetration', () => {
    const moving = circle(10, 2, 1);
    const target = rect(0, 0, 20, 20);
    const hit = sweepCircleVsRectangle(moving, 0, 0, target);

    expect(hit).not.toBeNull();
    expect(hit!.t).toBe(0);
    expect(hit!.normalX).toBe(0);
    expect(hit!.normalY).toBe(-1);
  });

  test('circle centre inside the rect, X exit axis, exitRight is the smaller exit', () => {
    const moving = circle(15, 10, 1);
    const target = rect(0, 0, 20, 20);
    const hit = sweepCircleVsRectangle(moving, 0, 0, target);

    expect(hit).not.toBeNull();
    expect(hit!.normalX).toBe(1);
    expect(hit!.normalY).toBe(0);
  });

  test('circle centre inside the rect, X exit axis, exitLeft is the smaller exit', () => {
    const moving = circle(3, 10, 1);
    const target = rect(0, 0, 20, 20);
    const hit = sweepCircleVsRectangle(moving, 0, 0, target);

    expect(hit).not.toBeNull();
    expect(hit!.normalX).toBe(-1);
    expect(hit!.normalY).toBe(0);
  });

  test('moving toward the top face but not far enough to reach the bottom face time-wise', () => {
    // tT lands in [0, 1] (hit), but tB overshoots past t = 1 — exercises the
    // tB-range check's false outcome (unlike the full-traverse top/bottom tests
    // above, which happen to satisfy both time windows at once).
    const moving = circle(10, -30, 5);
    const target = rect(0, 0, 20, 20);
    const hit = sweepCircleVsRectangle(moving, 0, 40, target);

    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(0.625, 5);
    expect(hit!.normalY).toBe(-1);
  });

  test('moving toward the rect too slowly — neither the top nor bottom face time window is reached', () => {
    const moving = circle(10, -100, 5);
    const target = rect(0, 0, 20, 20);
    const hit = sweepCircleVsRectangle(moving, 0, 10, target);

    expect(hit).toBeNull();
  });

  test('circle centre inside the rect, Y exit axis, exitBottom is the smaller exit', () => {
    const moving = circle(10, 18, 1);
    const target = rect(0, 0, 20, 20);
    const hit = sweepCircleVsRectangle(moving, 0, 0, target);

    expect(hit).not.toBeNull();
    expect(hit!.normalX).toBe(0);
    expect(hit!.normalY).toBe(1);
  });

  test('not overlapping and no movement → null', () => {
    const moving = circle(100, 100, 1);
    const target = rect(0, 0, 10, 10);
    const hit = sweepCircleVsRectangle(moving, 0, 0, target);

    expect(hit).toBeNull();
  });

  test('circle approaching the right face moving left (flat-face tR branch)', () => {
    const moving = circle(30, 10, 5);
    const target = rect(0, 0, 20, 20);
    const hit = sweepCircleVsRectangle(moving, -100, 0, target);

    expect(hit).not.toBeNull();
    expect(hit!.normalX).toBe(1);
    expect(hit!.normalY).toBe(0);
  });

  test('circle approaching the top face moving down (flat-face tT branch)', () => {
    const moving = circle(10, -30, 5);
    const target = rect(0, 0, 20, 20);
    const hit = sweepCircleVsRectangle(moving, 0, 100, target);

    expect(hit).not.toBeNull();
    expect(hit!.normalX).toBe(0);
    expect(hit!.normalY).toBe(-1);
  });

  test('circle approaching the bottom face moving up (flat-face tB branch)', () => {
    const moving = circle(10, 50, 5);
    const target = rect(0, 0, 20, 20);
    const hit = sweepCircleVsRectangle(moving, 0, -100, target);

    expect(hit).not.toBeNull();
    expect(hit!.normalX).toBe(0);
    expect(hit!.normalY).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// sweepRectangleAgainst
// ---------------------------------------------------------------------------

describe('sweepRectangleAgainst', () => {
  test('empty list → null', () => {
    expect(sweepRectangleAgainst(rect(0, 0, 10, 10), 50, 0, [])).toBeNull();
  });

  test('multiple targets, returns earliest hit', () => {
    const moving = rect(0, 0, 10, 10);
    // Near target at x=20, far target at x=60 — moving with delta=100
    const near = rect(20, 0, 10, 10);
    const far = rect(60, 0, 10, 10);
    const hit = sweepRectangleAgainst(moving, 100, 0, [far, near]);

    expect(hit).not.toBeNull();
    // Nearest: tEntry = (20-10)/100 = 0.1
    expect(hit!.t).toBeCloseTo(0.1, 5);
  });

  test('target whose AABB does not overlap swept AABB is skipped → null', () => {
    const moving = rect(0, 0, 10, 10);
    // Target far to the side — swept AABB only covers y=0..10
    const target = rect(5, 200, 10, 10);
    const hit = sweepRectangleAgainst(moving, 100, 0, [target]);

    expect(hit).toBeNull();
  });

  test('single target, on collision course → hit returned', () => {
    const moving = rect(0, 0, 10, 10);
    const target = rect(20, 0, 10, 10);
    const hit = sweepRectangleAgainst(moving, 20, 0, [target]);

    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(0.5, 5);
  });

  test('a later target with a later hit time does not replace the current earliest', () => {
    const moving = rect(0, 0, 10, 10);
    const near = rect(20, 0, 10, 10);
    const far = rect(60, 0, 10, 10);
    // near listed first this time, so the "far" candidate must fail the
    // hit.t < earliest.t check instead of setting it.
    const hit = sweepRectangleAgainst(moving, 100, 0, [near, far]);

    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(0.1, 5);
  });
});

// ---------------------------------------------------------------------------
// sweepCircleAgainst
// ---------------------------------------------------------------------------

describe('sweepCircleAgainst', () => {
  test('empty list → null', () => {
    expect(sweepCircleAgainst(circle(0, 0, 5), 50, 0, [])).toBeNull();
  });

  test('multiple targets, returns earliest hit', () => {
    const moving = circle(0, 0, 2);
    // Near at x=10 r=2 → combined 4, gap=10-4=6, t=6/100=0.06
    // Far  at x=50 r=2 → combined 4, gap=50-4=46, t=46/100=0.46
    const near = circle(10, 0, 2);
    const far = circle(50, 0, 2);
    const hit = sweepCircleAgainst(moving, 100, 0, [far, near]);

    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(6 / 100, 5);
  });

  test('target outside swept AABB → skipped, returns null', () => {
    const moving = circle(0, 0, 2);
    // Target far away in Y — not reachable with pure X delta
    const target = circle(5, 500, 2);
    const hit = sweepCircleAgainst(moving, 100, 0, [target]);

    expect(hit).toBeNull();
  });

  test('single target on collision course → hit returned', () => {
    const moving = circle(0, 0, 5);
    const target = circle(20, 0, 5);
    const hit = sweepCircleAgainst(moving, 20, 0, [target]);

    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(0.5, 5);
  });

  test('a later target with a later hit time does not replace the current earliest', () => {
    const moving = circle(0, 0, 2);
    const near = circle(10, 0, 2);
    const far = circle(50, 0, 2);
    const hit = sweepCircleAgainst(moving, 100, 0, [near, far]);

    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(6 / 100, 5);
  });
});

// ---------------------------------------------------------------------------
// substepSweep
// ---------------------------------------------------------------------------

describe('substepSweep', () => {
  test('maxStepSize=10, delta=(100,0) → 11 snapshots (t=0 to 1.0)', () => {
    const snapshots = [...substepSweep(0, 0, 100, 0, 10)];

    expect(snapshots).toHaveLength(11);
    expect(snapshots[0].t).toBeCloseTo(0, 10);
    expect(snapshots[10].t).toBeCloseTo(1, 10);

    for (let i = 0; i < snapshots.length; i++) {
      expect(snapshots[i].t).toBeCloseTo(i / 10, 10);
    }
  });

  test('zero delta → 2 snapshots at same position', () => {
    const snapshots = [...substepSweep(5, 7, 0, 0, 10)];

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toMatchObject({ x: 5, y: 7, t: 0 });
    expect(snapshots[1]).toMatchObject({ x: 5, y: 7, t: 1 });
  });

  test('snapshots interpolate position correctly', () => {
    const snapshots = [...substepSweep(10, 20, 50, 100, 25)];
    // length = hypot(50, 100) ≈ 111.8, stepCount = ceil(111.8/25) = 5, 6 snapshots
    expect(snapshots).toHaveLength(6);

    for (const snap of snapshots) {
      expect(snap.x).toBeCloseTo(10 + 50 * snap.t, 8);
      expect(snap.y).toBeCloseTo(20 + 100 * snap.t, 8);
    }
  });

  test('t=0 snapshot matches start position', () => {
    const first = substepSweep(3, 4, 10, 10, 5).next().value;

    expect(first.x).toBe(3);
    expect(first.y).toBe(4);
    expect(first.t).toBe(0);
  });

  test('t=1 snapshot matches end position', () => {
    const snapshots = [...substepSweep(0, 0, 30, 40, 10)];
    const last = snapshots[snapshots.length - 1];

    expect(last.x).toBeCloseTo(30, 8);
    expect(last.y).toBeCloseTo(40, 8);
    expect(last.t).toBeCloseTo(1, 10);
  });
});
