import assert from 'node:assert/strict';

import { Graphics } from '#rendering/primitives/Graphics';
import { GraphicsPath } from '#rendering/primitives/GraphicsPath';

const near = (actual: number, expected: number, tolerance = 1e-8): void => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

describe('tangent arcs', () => {
  for (const degrees of [-150, -135, -120, -90, -60, -45, -30, 30, 45, 60, 90, 120, 135, 150]) {
    test(`uses the short tangent corner for a ${degrees}-degree turn`, () => {
      const turn = (degrees * Math.PI) / 180;
      const distance = 10 * Math.tan(Math.abs(turn) / 2);
      const endX = Math.cos(turn) * distance;
      const endY = Math.sin(turn) * distance;
      const path = new GraphicsPath().moveTo(-100, 0).arcTo(0, 0, 100 * Math.cos(turn), 100 * Math.sin(turn), 10);
      const points = path.contours(0.01)[0]!.points;

      near(path.currentX, endX);
      near(path.currentY, endY);
      near(points[2]!, -distance);
      near(points[3]!, 0);
      near(points.at(-2)!, endX);
      near(points.at(-1)!, endY);
      let arcLength = 0;

      for (let index = 4; index < points.length; index += 2) {
        arcLength += Math.hypot(points[index]! - points[index - 2]!, points[index + 1]! - points[index - 1]!);
      }

      near(arcLength, 10 * Math.abs(turn), 0.05);
      const graphics = new Graphics();

      try {
        graphics.lineWidth = 1;
        graphics.moveTo(-100, 0).arcTo(0, 0, 100 * Math.cos(turn), 100 * Math.sin(turn), 10);
        near(graphics.currentPoint.x, endX);
        near(graphics.currentPoint.y, endY);
        assert.equal(graphics.children.length, 2);
        const arc = graphics.getChildAt(1).getLocalBounds();
        const centreX = -distance;
        const centreY = degrees > 0 ? 10 : -10;

        // The short turn must stay on the correct side of its tangent circle.
        if (Math.abs(degrees) <= 90) {
          assert.ok(arc.x >= centreX - 0.6);
          assert.ok(degrees > 0 ? arc.y + arc.height <= centreY + 0.6 : arc.y >= centreY - 0.6);
        }
      } finally {
        graphics.destroy();
      }
    });
  }

  test('preserves straight fallbacks for zero, repeated, collinear and oversized corners', () => {
    for (const [x1, y1, x2, y2, radius] of [
      [10, 0, 10, 10, 0],
      [0, 0, 10, 10, 5],
      [10, 0, 10, 0, 5],
      [10, 0, 20, 0, 5],
      [10, 0, 0, 0, 5],
      [10, 0, 10, 10, 20],
    ] as const) {
      const path = new GraphicsPath().moveTo(0, 0).arcTo(x1, y1, x2, y2, radius);

      near(path.currentX, x1);
      near(path.currentY, y1);
      assert.deepEqual(path.contours()[0]!.points, [0, 0, x1, y1]);
    }
  });
});
