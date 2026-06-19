import { SceneNode } from '#core/SceneNode';

// Oriented-box hit testing on SceneNode.contains.
//
// Before this fix contains() tested the axis-aligned bounding box even for
// rotated/skewed nodes, so a rotated sprite reported pointer hits in the empty
// corners of its AABB. Because the InteractionManager's narrow phase is
// node.contains (broad phase stays AABB via the quadtree), this over-reported
// picks on rotated nodes. contains() now maps the point into local space with
// the inverse of the global transform and tests the untransformed local bounds
// — a true oriented-box test — while keeping the cheap AABB path for
// axis-aligned nodes.

/** A SceneNode with a fixed 100x40 local-space rectangle for hit testing. */
class BoundedNode extends SceneNode {
  public constructor() {
    super();
    this.getLocalBounds().set(0, 0, 100, 40);
  }
}

describe('SceneNode.contains — oriented-box hit testing', () => {
  test('axis-aligned node uses the AABB fast path (rotation a multiple of 90°)', () => {
    const node = new BoundedNode();

    expect(node.isAlignedBox).toBe(true);
    expect(node.contains(50, 20)).toBe(true); // inside the bounds
    expect(node.contains(150, 20)).toBe(false); // right of the bounds

    node.setRotation(90);
    expect(node.isAlignedBox).toBe(true); // 90° is still axis-aligned → AABB path

    const bounds = node.getBounds();
    expect(node.contains(bounds.x + 1, bounds.y + 1)).toBe(true);

    node.destroy();
  });

  test('rotated node accepts a point inside the oriented box', () => {
    const node = new BoundedNode();
    node.setRotation(45);

    // Local centre (50, 20) is inside the bounds; map it to world space with the
    // same forward transform the renderer uses, then hit-test it.
    const m = node.getGlobalTransform();
    const worldX = 50 * m.a + 20 * m.b + m.x;
    const worldY = 50 * m.c + 20 * m.d + m.y;

    expect(node.contains(worldX, worldY)).toBe(true);

    node.destroy();
  });

  test('rotated node rejects a point inside the AABB but outside the oriented box', () => {
    const node = new BoundedNode();
    node.setRotation(45);

    // Local (50, 80) is OUTSIDE the 100x40 bounds (y > height) but, once rotated,
    // its world position still falls inside the loose axis-aligned bounding box.
    const m = node.getGlobalTransform();
    const worldX = 50 * m.a + 80 * m.b + m.x;
    const worldY = 50 * m.c + 80 * m.d + m.y;

    // The AABB contains it (this is what the old code tested) ...
    expect(node.getBounds().contains(worldX, worldY)).toBe(true);
    // ... but the oriented-box test correctly rejects it.
    expect(node.contains(worldX, worldY)).toBe(false);

    node.destroy();
  });

  test('skewed node uses the oriented-box path', () => {
    const node = new BoundedNode();
    node.skewX = 20;

    expect(node.isAlignedBox).toBe(false);

    // A point mapped from inside the local bounds is a hit under skew.
    const m = node.getGlobalTransform();
    const worldX = 50 * m.a + 20 * m.b + m.x;
    const worldY = 50 * m.c + 20 * m.d + m.y;

    expect(node.contains(worldX, worldY)).toBe(true);

    node.destroy();
  });
});
