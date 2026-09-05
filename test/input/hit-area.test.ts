/**
 * `RenderNode.hitArea` - an optional local-space pick shape that replaces the
 * bounds test `contains()` would otherwise perform.
 *
 * The shape is never re-transformed: the world point is mapped back through the
 * inverse of the node's global transform, so a rotated or scaled node keeps a
 * pick region that follows its rendered output. These tests pin that mapping,
 * the concave-polygon rule, and the fact that the subclasses which override
 * `contains()` with their own geometry test still honour the shape.
 */

import { Circle } from '#math/Circle';
import { Polygon } from '#math/Polygon';
import { Rectangle } from '#math/Rectangle';
import { Vector } from '#math/Vector';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';

/** A Drawable with a fixed 100x100 local-space rectangle for hit testing. */
class BoundedNode extends Drawable {
  public constructor() {
    super();
    this.setLocalBounds(0, 0, 100, 100);
  }
}

/** A 100x100 texture, the only way a Sprite gets a non-empty local extent. */
const createTexture = (): Texture => {
  const canvas = document.createElement('canvas');

  canvas.width = 100;
  canvas.height = 100;

  return new Texture(canvas);
};

/** Map a local-space point through the node's forward transform, as the renderer does. */
const toWorld = (node: Drawable, localX: number, localY: number): [number, number] => {
  const m = node.getGlobalTransform();

  return [localX * m.a + localY * m.b + m.x, localX * m.c + localY * m.d + m.y];
};

/**
 * An L-shape occupying the left column and the bottom row of the 100x100 box,
 * leaving the top-right quadrant as a notch that is inside the bounds but
 * outside the shape.
 */
const lShape = (): Polygon =>
  new Polygon([new Vector(0, 0), new Vector(50, 0), new Vector(50, 50), new Vector(100, 50), new Vector(100, 100), new Vector(0, 100)]);

describe('RenderNode.hitArea', () => {
  test('defaults to null and leaves the bounds test in charge', () => {
    const node = new BoundedNode();

    expect(node.hitArea).toBeNull();
    expect(node.contains(50, 50)).toBe(true);
    expect(node.contains(99, 99)).toBe(true);
    expect(node.contains(150, 50)).toBe(false);

    node.destroy();
  });

  test('a circle rejects the bounds corner it does not cover', () => {
    const node = new BoundedNode();

    node.hitArea = new Circle(50, 50, 50);

    expect(node.contains(50, 50)).toBe(true);
    expect(node.contains(95, 50)).toBe(true);
    // (99, 99) is inside the 100x100 bounds but ~19px outside the inscribed circle.
    expect(node.contains(99, 99)).toBe(false);
    expect(node.contains(1, 1)).toBe(false);

    node.destroy();
  });

  test('clearing the hit area restores the bounds behaviour', () => {
    const node = new BoundedNode();

    node.hitArea = new Circle(50, 50, 50);
    expect(node.contains(99, 99)).toBe(false);

    node.hitArea = null;
    expect(node.contains(99, 99)).toBe(true);

    node.destroy();
  });

  test('the shape is read live, so mutating it in place takes effect immediately', () => {
    const node = new BoundedNode();
    const circle = new Circle(50, 50, 10);

    node.hitArea = circle;
    expect(node.contains(80, 50)).toBe(false);

    circle.radius = 40;
    expect(node.contains(80, 50)).toBe(true);

    node.destroy();
  });

  test('a concave polygon misses in its notch and hits on its arms', () => {
    const node = new BoundedNode();

    node.hitArea = lShape();

    // Both arms of the L.
    expect(node.contains(25, 25)).toBe(true);
    expect(node.contains(75, 75)).toBe(true);
    // The notch: inside the bounds, outside the shape.
    expect(node.contains(75, 25)).toBe(false);
    // Outside the bounds entirely.
    expect(node.contains(150, 75)).toBe(false);

    node.destroy();
  });

  test('the shape is expressed in local space, so it follows a moved node', () => {
    const node = new BoundedNode();

    node.hitArea = new Circle(50, 50, 20);
    node.setPosition(400, 300);

    expect(node.contains(450, 350)).toBe(true);
    expect(node.contains(50, 50)).toBe(false);

    node.destroy();
  });

  test('a rotated node maps the world point back through its inverse transform', () => {
    const node = new BoundedNode();

    node.hitArea = new Circle(50, 50, 20);
    node.setRotation(45);

    // Rotation cannot change which LOCAL points the circle covers, so every
    // verdict below is the unrotated one, taken at the world position the
    // renderer places that local point at.
    expect(node.contains(...toWorld(node, 50, 50))).toBe(true);
    expect(node.contains(...toWorld(node, 65, 50))).toBe(true);
    expect(node.contains(...toWorld(node, 80, 50))).toBe(false);
    // The local top-left corner: inside the bounds, outside the circle.
    expect(node.contains(...toWorld(node, 5, 5))).toBe(false);

    // Without the inverse map the raw world coordinates would be tested
    // against the local circle, and the rotated centre would read as a miss.
    const [worldCentreX, worldCentreY] = toWorld(node, 50, 50);

    expect(worldCentreX).not.toBeCloseTo(50);
    expect(worldCentreY).not.toBeCloseTo(50);

    node.destroy();
  });

  test('a scaled node maps the world point back through its inverse transform', () => {
    const node = new BoundedNode();

    node.hitArea = new Circle(50, 50, 20);
    node.setScale(2, 2);

    expect(node.contains(100, 100)).toBe(true);
    // Local (85, 50) is outside the radius-20 circle; scaled it sits at (170, 100).
    expect(node.contains(170, 100)).toBe(false);
    // Local (65, 50) is inside; scaled it sits at (130, 100).
    expect(node.contains(130, 100)).toBe(true);

    node.destroy();
  });

  test('a rectangle hit area shrinks the pick region without touching bounds', () => {
    const node = new BoundedNode();

    node.hitArea = new Rectangle(0, 0, 20, 20);

    expect(node.contains(10, 10)).toBe(true);
    expect(node.contains(50, 50)).toBe(false);

    // Bounds, and therefore culling and rendering, are untouched.
    const bounds = node.getBounds();

    expect(bounds.width).toBe(100);
    expect(bounds.height).toBe(100);

    node.destroy();
  });

  test("a Sprite's own quad test defers to the hit area", () => {
    const texture = createTexture();
    const sprite = new Sprite(texture);

    expect(sprite.contains(99, 99)).toBe(true);

    sprite.hitArea = new Circle(50, 50, 50);

    expect(sprite.contains(50, 50)).toBe(true);
    expect(sprite.contains(99, 99)).toBe(false);

    sprite.destroy();
    texture.destroy();
  });

  test("a Container's child-union test defers to the hit area", () => {
    const container = new Container();
    const child = new BoundedNode();

    container.addChild(child);

    // No child under (200, 200), so the union test misses.
    expect(container.contains(200, 200)).toBe(false);

    container.hitArea = new Rectangle(150, 150, 100, 100);

    expect(container.contains(200, 200)).toBe(true);
    expect(container.contains(50, 50)).toBe(false);

    container.destroy();
  });
});
