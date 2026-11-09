import assert from 'node:assert/strict';

import { Color } from '#core/Color';
import { Circle } from '#math/Circle';
import { Ellipse } from '#math/Ellipse';
import { buildCircle, buildEllipse, type MeshGeometryData } from '#math/geometry';
import type { Mesh } from '#rendering/mesh/Mesh';
import { Graphics } from '#rendering/primitives/Graphics';

const assertFan = (data: MeshGeometryData, minimumArea: number): void => {
  assert.ok(data.vertices.length >= 8);
  assert.ok(data.indices.length >= 9);
  let area = 0;

  for (let index = 0; index < data.indices.length; index += 3) {
    const a = data.indices[index]!;
    const b = data.indices[index + 1]!;
    const c = data.indices[index + 2]!;

    assert.ok(a < data.vertices.length / 2 && b < data.vertices.length / 2 && c < data.vertices.length / 2);
    const cross =
      (data.vertices[b * 2]! - data.vertices[a * 2]!) * (data.vertices[c * 2 + 1]! - data.vertices[a * 2 + 1]!) -
      (data.vertices[b * 2 + 1]! - data.vertices[a * 2 + 1]!) * (data.vertices[c * 2]! - data.vertices[a * 2]!);

    assert.ok(Math.abs(cross) > 0);
    area += Math.abs(cross) / 2;
  }

  assert.ok(area > minimumArea);
};

describe('positive small circle and ellipse radii', () => {
  for (const radius of [0.0001, 0.001, 0.005, 0.01, 0.02, 1]) {
    test(`builds a nondegenerate circle fan at radius ${radius}`, () => {
      assertFan(buildCircle(0, 0, radius), radius * radius * 0.1);
    });

    test(`builds a nondegenerate ellipse fan at radii ${radius} and ${radius / 2}`, () => {
      assertFan(buildEllipse(0, 0, radius, radius / 2), radius * radius * 0.05);
    });
  }

  test('keeps the zero-radius builders empty', () => {
    assert.equal(buildCircle(0, 0, 0).indices.length, 0);
    assert.equal(buildEllipse(0, 0, 0, 0).indices.length, 0);
  });

  for (const retained of [false, true]) {
    test(`draws scaled small shapes without relaxing Mesh validation, retained=${retained}`, () => {
      const graphics = new Graphics({ fill: Color.red });
      const circle = new Circle(0, 0, 0.005);
      const ellipse = new Ellipse(0, 0, 0.005, 0.0025);

      try {
        graphics.setScale(1000);

        if (retained) {
          graphics.addShape(circle);
          graphics.addShape(ellipse);
        } else {
          graphics.fillColor = Color.red;
          graphics.drawCircle(0, 0, 0.005);
          graphics.drawEllipse(0, 0, 0.005, 0.0025);
        }

        assert.equal(graphics.children.length, 2);

        for (const child of graphics.children) {
          const mesh = child as Mesh;

          assert.equal(mesh.visible, true);
          assert.ok(mesh.vertices.length >= 8);
          assert.ok(mesh.indices!.length >= 9);
        }
      } finally {
        graphics.destroy();
        circle.destroy();
        ellipse.destroy();
      }
    });
  }
});
