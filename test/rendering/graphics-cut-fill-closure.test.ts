import assert from 'node:assert/strict';

import { Color } from '#core/Color';
import { Circle } from '#math/Circle';
import { Rectangle } from '#math/Rectangle';
import type { Mesh } from '#rendering/mesh/Mesh';
import { Graphics } from '#rendering/primitives/Graphics';
import { GraphicsPath } from '#rendering/primitives/GraphicsPath';

const area = (mesh: Mesh): number => {
  const vertices = mesh.vertices;
  const indices = mesh.indices!;
  let result = 0;

  for (let index = 0; index < indices.length; index += 3) {
    const a = 2 * indices[index]!;
    const b = 2 * indices[index + 1]!;
    const c = 2 * indices[index + 2]!;

    result += Math.abs(
      (vertices[b]! - vertices[a]!) * (vertices[c + 1]! - vertices[a + 1]!) -
        (vertices[b + 1]! - vertices[a + 1]!) * (vertices[c]! - vertices[a]!),
    );
  }

  return result / 2;
};

describe('implicit base fill closure during subtraction', () => {
  for (const closed of [false, true]) {
    for (const kind of ['rectangle', 'circle', 'path']) {
      test(`preserves a disjoint ${kind} cut with closed base=${closed}`, () => {
        const source = new GraphicsPath().moveTo(0, 0).lineTo(10, 0).lineTo(0, 10);

        if (closed) {
          source.closePath();
        }

        const cut =
          kind === 'rectangle'
            ? new Rectangle(100, 100, 5, 5)
            : kind === 'circle'
              ? new Circle(100, 100, 5)
              : new GraphicsPath().rect(100, 100, 5, 5);
        const graphics = new Graphics({ fill: Color.red });

        try {
          const handle = graphics.addShape(source);
          const mesh = graphics.getChildAt(0) as Mesh;

          assert.equal(area(mesh), 50);
          handle.cutShape(cut);
          assert.equal(mesh.visible, true);
          assert.equal(area(mesh), 50);
        } finally {
          graphics.destroy();

          if (!(cut instanceof GraphicsPath)) {
            cut.destroy();
          }
        }
      });
    }
  }

  test('keeps intersecting cuts live without closing the authored base', () => {
    const source = new GraphicsPath().moveTo(0, 0).lineTo(10, 0).lineTo(0, 10);
    const cut = new Rectangle(1, 1, 2, 2);
    const graphics = new Graphics({ fill: Color.red });

    try {
      graphics.addShape(source).cutShape(cut);
      const mesh = graphics.getChildAt(0) as Mesh;

      assert.equal(mesh.visible, true);
      assert.equal(area(mesh), 46);
      assert.equal(source.contours()[0]!.closed, false);
      cut.set(100, 100, 2, 2);
      assert.equal(area(mesh), 50);
      cut.destroy();
      assert.equal(area(mesh), 50);
    } finally {
      graphics.destroy();
    }
  });

  test('continues rejecting an open cut before changing the drawing', () => {
    const source = new GraphicsPath().moveTo(0, 0).lineTo(10, 0).lineTo(0, 10);
    const cut = new GraphicsPath().moveTo(1, 1).lineTo(2, 1).lineTo(1, 2);
    const graphics = new Graphics({ fill: Color.red });

    try {
      const handle = graphics.addShape(source);
      const mesh = graphics.getChildAt(0) as Mesh;

      assert.throws(() => handle.cutShape(cut), /closed subpaths/);
      assert.equal(mesh.visible, true);
      assert.equal(area(mesh), 50);
    } finally {
      graphics.destroy();
    }
  });
});
