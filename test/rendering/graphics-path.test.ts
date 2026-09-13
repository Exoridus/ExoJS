import { GraphicsPath, type PathContour } from '#rendering/primitives/GraphicsPath';

const xs = (contour: PathContour): number[] => contour.points.filter((_, index) => index % 2 === 0);
const ys = (contour: PathContour): number[] => contour.points.filter((_, index) => index % 2 === 1);
const vertexCount = (contour: PathContour): number => contour.points.length / 2;

/** Largest distance from any flattened vertex to the circle it should lie on. */
const radialError = (contour: PathContour, centerX: number, centerY: number, radius: number): number => {
  let worst = 0;

  for (let i = 0; i < contour.points.length; i += 2) {
    worst = Math.max(worst, Math.abs(Math.hypot(contour.points[i]! - centerX, contour.points[i + 1]! - centerY) - radius));
  }

  return worst;
};

describe('GraphicsPath', () => {
  test('starts empty and reports no contours', () => {
    const path = new GraphicsPath();

    expect(path.isEmpty).toBe(true);
    expect(path.contours()).toEqual([]);
  });

  test('records a straight open subpath', () => {
    const contours = new GraphicsPath().moveTo(0, 0).lineTo(10, 0).lineTo(10, 10).contours();

    expect(contours).toHaveLength(1);
    expect(contours[0]!.closed).toBe(false);
    expect(contours[0]!.points).toEqual([0, 0, 10, 0, 10, 10]);
  });

  test('opens a subpath at the origin when the first command draws', () => {
    const contours = new GraphicsPath().lineTo(5, 5).contours();

    expect(contours[0]!.points).toEqual([0, 0, 5, 5]);
  });

  test('marks a closed subpath without repeating its first vertex', () => {
    const contours = new GraphicsPath().moveTo(0, 0).lineTo(10, 0).lineTo(10, 10).lineTo(0, 0).closePath().contours();

    expect(contours).toHaveLength(1);
    expect(contours[0]!.closed).toBe(true);
    expect(contours[0]!.points).toEqual([0, 0, 10, 0, 10, 10]);
  });

  test('returns the cursor to the subpath start after closing', () => {
    const path = new GraphicsPath().moveTo(4, 6).lineTo(20, 20).closePath();

    expect(path.currentX).toBe(4);
    expect(path.currentY).toBe(6);
  });

  test('keeps subpaths separate', () => {
    const contours = new GraphicsPath().moveTo(0, 0).lineTo(1, 0).moveTo(10, 10).lineTo(11, 10).contours();

    expect(contours).toHaveLength(2);
    expect(contours[0]!.points).toEqual([0, 0, 1, 0]);
    expect(contours[1]!.points).toEqual([10, 10, 11, 10]);
  });

  test('drops a subpath too short to draw', () => {
    expect(new GraphicsPath().moveTo(3, 3).contours()).toEqual([]);
  });

  test('rect is a closed quad', () => {
    const contours = new GraphicsPath().rect(2, 3, 10, 4).contours();

    expect(contours).toHaveLength(1);
    expect(contours[0]!.closed).toBe(true);
    expect(contours[0]!.points).toEqual([2, 3, 12, 3, 12, 7, 2, 7]);
  });

  describe('curves', () => {
    test('land exactly on the segment endpoints', () => {
      const quadratic = new GraphicsPath().moveTo(0, 0).quadraticCurveTo(10, 20, 20, 0).contours()[0]!;
      const cubic = new GraphicsPath().moveTo(0, 0).bezierCurveTo(5, 20, 15, -20, 20, 0).contours()[0]!;

      expect(quadratic.points.slice(0, 2)).toEqual([0, 0]);
      expect(quadratic.points.slice(-2)).toEqual([20, 0]);
      expect(cubic.points.slice(0, 2)).toEqual([0, 0]);
      expect(cubic.points.slice(-2)).toEqual([20, 0]);
    });

    test('subdivide further for a tighter tolerance', () => {
      const path = new GraphicsPath().moveTo(0, 0).bezierCurveTo(0, 100, 100, 100, 100, 0);

      const coarse = vertexCount(path.contours(4)[0]!);
      const fine = vertexCount(path.contours(0.05)[0]!);

      expect(fine).toBeGreaterThan(coarse * 2);
    });

    test('stay within the requested tolerance of the true curve', () => {
      // A half-circle written as a quadratic has a known chord: every flattened
      // vertex of a symmetric arc-like curve must sit close to the curve, which
      // is measured here against the analytic quadratic at the nearest t.
      const tolerance = 0.1;
      const contour = new GraphicsPath().moveTo(0, 0).quadraticCurveTo(50, 100, 100, 0).contours(tolerance)[0]!;

      for (let i = 0; i < contour.points.length; i += 2) {
        const x = contour.points[i]!;
        const t = x / 100;
        const trueY = 2 * t * (1 - t) * 100;

        expect(Math.abs(contour.points[i + 1]! - trueY)).toBeLessThan(tolerance * 2);
      }
    });
  });

  describe('arcs', () => {
    test('sweep clockwise by default and anticlockwise on request', () => {
      const clockwise = new GraphicsPath().arc(0, 0, 10, 0, Math.PI / 2).contours()[0]!;
      const anticlockwise = new GraphicsPath().arc(0, 0, 10, 0, Math.PI / 2, true).contours()[0]!;

      // A quarter turn stays in the positive quadrant.
      expect(Math.min(...ys(clockwise))).toBeGreaterThanOrEqual(0);
      expect(Math.min(...xs(clockwise))).toBeGreaterThanOrEqual(0);

      // The other way round, the same endpoints enclose the other three.
      expect(Math.min(...ys(anticlockwise))).toBeLessThan(-9.5);
      expect(Math.min(...xs(anticlockwise))).toBeLessThan(-9.5);
    });

    test('stay within tolerance of the radius', () => {
      const tolerance = 0.2;
      const contour = new GraphicsPath().arc(5, 5, 40, 0, Math.PI).contours(tolerance)[0]!;

      expect(radialError(contour, 5, 5, 40)).toBeLessThanOrEqual(tolerance + 1e-9);
    });

    test('bridge to the arc start with a straight segment', () => {
      const contour = new GraphicsPath()
        .moveTo(-100, 0)
        .arc(0, 0, 10, 0, Math.PI / 2)
        .contours()[0]!;

      expect(contour.points.slice(0, 4)).toEqual([-100, 0, 10, 0]);
    });
  });

  describe('arcTo', () => {
    test('rounds a right-angled corner', () => {
      const contour = new GraphicsPath().moveTo(0, 0).arcTo(100, 0, 100, 100, 20).lineTo(100, 100).contours(0.05)[0]!;

      expect(radialError({ points: contour.points.slice(4, -2), closed: false }, 80, 20, 20)).toBeLessThan(0.2);
      expect(Math.max(...xs(contour))).toBeCloseTo(100, 6);
    });

    test('degrades to a straight segment where no arc fits', () => {
      expect(new GraphicsPath().moveTo(0, 0).arcTo(10, 0, 20, 0, 5).contours()[0]!.points).toEqual([0, 0, 10, 0]);
      expect(new GraphicsPath().moveTo(0, 0).arcTo(10, 0, 10, 10, 0).contours()[0]!.points).toEqual([0, 0, 10, 0]);
      expect(new GraphicsPath().moveTo(0, 0).arcTo(10, 0, 10, 10, 9999).contours()[0]!.points).toEqual([0, 0, 10, 0]);
    });
  });

  describe('shape helpers', () => {
    test('circle closes on the radius', () => {
      const contour = new GraphicsPath().circle(3, -4, 25).contours(0.1)[0]!;

      expect(contour.closed).toBe(true);
      expect(radialError(contour, 3, -4, 25)).toBeLessThanOrEqual(0.1 + 1e-9);
    });

    test('ellipse spans both radii', () => {
      const contour = new GraphicsPath().ellipse(0, 0, 30, 10).contours(0.05)[0]!;

      expect(contour.closed).toBe(true);
      expect(Math.max(...xs(contour))).toBeCloseTo(30, 6);
      expect(Math.min(...xs(contour))).toBeCloseTo(-30, 6);
      expect(Math.max(...ys(contour))).toBeCloseTo(10, 6);
      expect(Math.min(...ys(contour))).toBeCloseTo(-10, 6);
    });

    test('roundedRect stays inside its rectangle and clamps the radius', () => {
      const contour = new GraphicsPath().roundedRect(0, 0, 40, 20, 50).contours(0.05)[0]!;

      expect(contour.closed).toBe(true);
      expect(Math.min(...xs(contour))).toBeGreaterThanOrEqual(-1e-6);
      expect(Math.max(...xs(contour))).toBeLessThanOrEqual(40 + 1e-6);
      expect(Math.min(...ys(contour))).toBeGreaterThanOrEqual(-1e-6);
      expect(Math.max(...ys(contour))).toBeLessThanOrEqual(20 + 1e-6);

      // Clamped to half the shorter side rather than honoured or dropped: with
      // a corner radius of 10 the path passes 10*sqrt(2) - 10 from the
      // rectangle's own corner, where a degenerate arc would have touched it.
      for (let i = 0; i < contour.points.length; i += 2) {
        expect(Math.hypot(contour.points[i]!, contour.points[i + 1]!)).toBeGreaterThan(4);
      }
    });

    test('roundedRect with a zero radius is a plain rect', () => {
      expect(new GraphicsPath().roundedRect(1, 2, 8, 6, 0).contours()[0]!.points).toEqual(new GraphicsPath().rect(1, 2, 8, 6).contours()[0]!.points);
    });
  });

  describe('lifetime', () => {
    test('clone is independent of its source', () => {
      const original = new GraphicsPath().moveTo(0, 0).lineTo(10, 0);
      const copy = original.clone();

      copy.lineTo(10, 10);

      expect(vertexCount(original.contours()[0]!)).toBe(2);
      expect(vertexCount(copy.contours()[0]!)).toBe(3);
    });

    test('clear resets the cursor as well as the commands', () => {
      const path = new GraphicsPath().moveTo(50, 50).lineTo(60, 60).clear();

      expect(path.isEmpty).toBe(true);
      expect(path.currentX).toBe(0);
      expect(path.currentY).toBe(0);
      expect(path.lineTo(5, 0).contours()[0]!.points).toEqual([0, 0, 5, 0]);
    });

    test('flattening twice does not consume the path', () => {
      const path = new GraphicsPath().circle(0, 0, 10);

      expect(path.contours()).toEqual(path.contours());
    });
  });
});
