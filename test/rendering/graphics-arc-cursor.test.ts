import assert from 'node:assert/strict';

import { Graphics } from '#rendering/primitives/Graphics';
import { GraphicsPath } from '#rendering/primitives/GraphicsPath';

const near = (actual: number, expected: number): void => {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
};

describe('normalized arc cursor', () => {
  for (const [turns, anticlockwise, sweep] of [
    [1, false, 1],
    [2, false, 2],
    [3, false, 2],
    [5, false, 2],
    [-3, false, 1],
    [-5, false, 1],
    [-1, true, -1],
    [-2, true, -2],
    [-3, true, -2],
    [-5, true, -2],
    [3, true, -1],
    [5, true, -1],
  ] as const) {
    test(`keeps geometry and cursor aligned for ${turns}pi, anticlockwise=${anticlockwise}`, () => {
      const start = 0.3;
      const end = start + sweep * Math.PI;
      const expectedX = 4 + 10 * Math.cos(end);
      const expectedY = 7 + 10 * Math.sin(end);
      const path = new GraphicsPath().arc(4, 7, 10, start, start + turns * Math.PI, anticlockwise);
      const points = path.contours(0.01)[0]!.points;

      near(path.currentX, expectedX);
      near(path.currentY, expectedY);
      near(points.at(-2)!, expectedX);
      near(points.at(-1)!, expectedY);
      const graphics = new Graphics();

      try {
        graphics.lineWidth = 1;
        graphics.drawArc(4, 7, 10, start, start + turns * Math.PI, anticlockwise);
        near(graphics.currentPoint.x, expectedX);
        near(graphics.currentPoint.y, expectedY);
      } finally {
        graphics.destroy();
      }
    });
  }

  test('starts a following quadratic at the endpoint actually drawn', () => {
    const path = new GraphicsPath().arc(0, 0, 10, 0, 3 * Math.PI);
    const count = path.contours(0.01)[0]!.points.length;

    path.quadraticCurveTo(10, 40, 30, 40);
    const actual = path.contours(0.01)[0]!.points.slice(count - 2);
    const expected = new GraphicsPath().moveTo(10, 0).quadraticCurveTo(10, 40, 30, 40).contours(0.01)[0]!.points;

    assert.equal(actual.length, expected.length);

    for (let index = 0; index < actual.length; index++) {
      near(actual[index]!, expected[index]!);
    }
  });

  test('keeps zero and opposite-direction whole turns empty', () => {
    for (const [end, anticlockwise] of [[0, false], [-4 * Math.PI, false], [4 * Math.PI, true]] as const) {
      const path = new GraphicsPath().arc(0, 0, 10, 0, end, anticlockwise);

      assert.deepEqual(path.contours(), []);
      near(path.currentX, 10);
      near(path.currentY, 0);
    }
  });
});
