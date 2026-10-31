import { Color } from '#core/Color';
import { Circle } from '#math/Circle';
import { Polygon } from '#math/Polygon';
import { Rectangle } from '#math/Rectangle';
import { Vector } from '#math/Vector';
import type { Mesh } from '#rendering/mesh/Mesh';
import { Graphics } from '#rendering/primitives/Graphics';
import { GraphicsPath } from '#rendering/primitives/GraphicsPath';

/** Area covered by the mesh triangles; overlapping triangles would count twice. */
const meshArea = (mesh: Mesh): number => {
  const { vertices } = mesh;
  const indices = mesh.indices!;
  let area = 0;

  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t]! * 2;
    const b = indices[t + 1]! * 2;
    const c = indices[t + 2]! * 2;

    area += Math.abs(
      (vertices[b]! - vertices[a]!) * (vertices[c + 1]! - vertices[a + 1]!) -
        (vertices[b + 1]! - vertices[a + 1]!) * (vertices[c]! - vertices[a]!),
    );
  }

  return area / 2;
};

const listenerCount = (shape: object): number =>
  (shape as unknown as { _geometryListeners: Map<unknown, unknown> | null })._geometryListeners?.size ?? 0;

describe('GraphicsShape.cutShape', () => {
  test('subtracts a cut from the drawing without touching the source', () => {
    const base = new Rectangle(0, 0, 20, 20);
    const cut = new Rectangle(5, 5, 4, 4);
    const graphics = new Graphics({ fill: Color.red });
    const handle = graphics.addShape(base);

    expect(handle.cutShape(cut)).toBe(handle);
    expect(meshArea(graphics.getChildAt(0))).toBeCloseTo(400 - 16);
    expect([base.x, base.y, base.width, base.height]).toEqual([0, 0, 20, 20]);

    graphics.destroy();
    base.destroy();
    cut.destroy();
  });

  test('cuts stay local to their handle', () => {
    const base = new Rectangle(0, 0, 20, 20);
    const cut = new Rectangle(0, 0, 10, 20);
    const first = new Graphics({ fill: Color.red });
    const second = new Graphics({ fill: Color.red });

    first.addShape(base).cutShape(cut);
    second.addShape(base);

    expect(meshArea(first.getChildAt(0))).toBeCloseTo(200);
    expect(meshArea(second.getChildAt(0))).toBeCloseTo(400);

    first.destroy();
    second.destroy();
    base.destroy();
    cut.destroy();
  });

  test('overlapping cuts remove their union once', () => {
    const base = new Rectangle(0, 0, 20, 20);
    const graphics = new Graphics({ fill: Color.red });

    graphics
      .addShape(base)
      .cutShape(new Rectangle(2, 2, 8, 8))
      .cutShape(new Rectangle(6, 6, 8, 8));

    expect(meshArea(graphics.getChildAt(0))).toBeCloseTo(400 - (64 + 64 - 16));

    graphics.destroy();
    base.destroy();
  });

  test('base and cut edits are live', () => {
    const base = new Rectangle(0, 0, 20, 20);
    const cut = new Rectangle(5, 5, 4, 4);
    const graphics = new Graphics({ fill: Color.red });

    graphics.addShape(base).cutShape(cut);
    cut.width = 10;

    expect(meshArea(graphics.getChildAt(0))).toBeCloseTo(400 - 40);

    base.width = 40;

    expect(meshArea(graphics.getChildAt(0))).toBeCloseTo(800 - 40);

    graphics.destroy();
    base.destroy();
    cut.destroy();
  });

  test('a destroyed cut drops out and the drawing is whole again', () => {
    const base = new Rectangle(0, 0, 20, 20);
    const cut = new Circle(10, 10, 5);
    const graphics = new Graphics({ fill: Color.red });
    const handle = graphics.addShape(base).cutShape(cut);

    expect(meshArea(graphics.getChildAt(0))).toBeLessThan(400 - 70);

    cut.destroy();

    expect(handle.removed).toBe(false);
    expect(meshArea(graphics.getChildAt(0))).toBeCloseTo(400);

    base.width = 30;

    expect(meshArea(graphics.getChildAt(0))).toBeCloseTo(600);

    graphics.destroy();
    base.destroy();
  });

  test('destroying the base removes the drawing and releases its cut subscriptions', () => {
    const base = new Polygon([new Vector(0, 0), new Vector(20, 0), new Vector(0, 20)]);
    const cut = new Circle(5, 5, 2);
    const graphics = new Graphics({ fill: Color.red });

    graphics.addShape(base).cutShape(cut);

    expect(listenerCount(cut)).toBe(1);

    base.destroy();

    expect(graphics.children).toHaveLength(0);
    expect(listenerCount(cut)).toBe(0);

    graphics.destroy();
    cut.destroy();
  });

  test('clearing the Graphics releases cut subscriptions', () => {
    const base = new Rectangle(0, 0, 20, 20);
    const cut = new Rectangle(5, 5, 4, 4);
    const graphics = new Graphics({ fill: Color.red });

    graphics.addShape(base).cutShape(cut);
    graphics.clear();

    expect(listenerCount(cut)).toBe(0);

    graphics.destroy();
    base.destroy();
    cut.destroy();
  });

  test('a cut covering the whole base hides the drawing until it moves away', () => {
    const base = new Rectangle(0, 0, 10, 10);
    const cut = new Rectangle(-5, -5, 30, 30);
    const graphics = new Graphics({ fill: Color.red });

    graphics.addShape(base).cutShape(cut);

    expect(graphics.getChildAt(0).visible).toBe(false);

    cut.x = 100;

    expect(graphics.getChildAt(0).visible).toBe(true);
    expect(meshArea(graphics.getChildAt(0))).toBeCloseTo(100);

    graphics.destroy();
    base.destroy();
    cut.destroy();
  });

  test('a closed path can cut and be cut', () => {
    const base = new GraphicsPath().rect(0, 0, 20, 20);
    const cut = new GraphicsPath().moveTo(5, 5).lineTo(15, 5).lineTo(10, 15).closePath();
    const graphics = new Graphics({ fill: Color.red });

    graphics.addShape(base).cutShape(cut);

    expect(meshArea(graphics.getChildAt(0))).toBeCloseTo(400 - 50);

    graphics.destroy();
  });

  test('rejects open path cuts, duplicate cuts, cutting with the base itself and cutting a removed drawing', () => {
    const base = new Rectangle(0, 0, 20, 20);
    const cut = new Rectangle(5, 5, 4, 4);
    const graphics = new Graphics({ fill: Color.red });
    const handle = graphics.addShape(base).cutShape(cut);

    expect(() => handle.cutShape(new GraphicsPath().moveTo(0, 0).lineTo(10, 10))).toThrow(/closed/);
    expect(() => handle.cutShape(cut)).toThrow(/already/);
    expect(() => handle.cutShape(base)).toThrow(/itself/);

    graphics.clear();

    expect(() => handle.cutShape(new Rectangle(1, 1, 1, 1))).toThrow(/removed/);

    graphics.destroy();
    base.destroy();
    cut.destroy();
  });
});
