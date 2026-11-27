import assert from 'node:assert/strict';

import { Color } from '#core/Color';
import { Graphics } from '#rendering/primitives/Graphics';
import { GraphicsPath } from '#rendering/primitives/GraphicsPath';

const distanceToPolyline = (x: number, y: number, points: readonly number[]): number => {
  let nearest = Infinity;

  for (let index = 2; index < points.length; index += 2) {
    const ax = points[index - 2]!;
    const ay = points[index - 1]!;
    const dx = points[index]! - ax;
    const dy = points[index + 1]! - ay;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared));

    nearest = Math.min(nearest, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }

  return nearest;
};

describe('Bezier flattening against finite chords', () => {
  for (const tolerance of [0.25, 0.01, 0.0001]) {
    test(`retains a quadratic with coincident endpoints at tolerance ${tolerance}`, () => {
      const points = new GraphicsPath().moveTo(0, 0).quadraticCurveTo(100, 100, 0, 0).contours(tolerance)[0]!.points;

      for (let sample = 0; sample <= 200; sample++) {
        const t = sample / 200;
        const coordinate = 200 * t * (1 - t);

        assert.ok(distanceToPolyline(coordinate, coordinate, points) <= tolerance + 1e-9);
      }
    });

    test(`retains a closed cubic loop at tolerance ${tolerance}`, () => {
      const points = new GraphicsPath().moveTo(0, 0).bezierCurveTo(100, 100, -100, 100, 0, 0).contours(tolerance)[0]!.points;

      for (let sample = 0; sample <= 200; sample++) {
        const t = sample / 200;
        const x = 300 * t * (1 - t) * (1 - 2 * t);
        const y = 300 * t * (1 - t);

        assert.ok(distanceToPolyline(x, y, points) <= tolerance + 1e-9);
      }
    });

    test(`retains collinear quadratic overshoot at tolerance ${tolerance}`, () => {
      const points = new GraphicsPath().moveTo(0, 0).quadraticCurveTo(200, 0, 100, 0).contours(tolerance)[0]!.points;

      assert.ok(distanceToPolyline(400 / 3, 0, points) <= tolerance + 1e-9);
      assert.deepEqual(points.slice(0, 2), [0, 0]);
      assert.deepEqual(points.slice(-2), [100, 0]);
    });

    test(`retains both directions of a collinear cubic at tolerance ${tolerance}`, () => {
      const points = new GraphicsPath().moveTo(0, 0).bezierCurveTo(200, 0, -200, 0, 0, 0).contours(tolerance)[0]!.points;

      for (let sample = 0; sample <= 200; sample++) {
        const t = sample / 200;
        const x = 600 * t * (1 - t) * (1 - 2 * t);

        assert.ok(distanceToPolyline(x, 0, points) <= tolerance + 1e-9);
      }
    });
  }

  test('keeps a completely collapsed curve bounded', () => {
    const points = new GraphicsPath().moveTo(2, 3).bezierCurveTo(2, 3, 2, 3, 2, 3).contours(0.0001)[0]!.points;

    assert.deepEqual(points, [2, 3, 2, 3]);
  });

  test('produces drawable geometry for open and closed cubic loops', () => {
    for (const closed of [false, true]) {
      const path = new GraphicsPath().moveTo(0, 0).bezierCurveTo(100, 100, -100, 100, 0, 0);
      const graphics = new Graphics();

      try {
        if (closed) {
          path.closePath();
        }

        graphics.fillColor = Color.red;
        graphics.lineWidth = 2;
        graphics.drawShape(path, 0.01);
        assert.ok(graphics.children.length > 0);
        assert.ok(graphics.getBounds().height >= 75);
      } finally {
        graphics.destroy();
      }
    }
  });
});
