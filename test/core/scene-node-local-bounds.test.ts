import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';

describe('SceneNode.setLocalBounds', () => {
  test('writes the local rectangle in place without reallocating it', () => {
    const node = new Drawable();
    const bounds = node.getLocalBounds();

    node.setLocalBounds(2, 3, 16, 24);

    expect(node.getLocalBounds()).toBe(bounds);
    expect(node.getLocalBounds().x).toBe(2);
    expect(node.getLocalBounds().y).toBe(3);
    expect(node.getLocalBounds().width).toBe(16);
    expect(node.getLocalBounds().height).toBe(24);
  });

  test('runs the bounds-invalidation cascade the manual write idiom used to require', () => {
    const parent = new Container();
    const node = new Drawable();

    parent.addChild(node);

    // Settle both nodes so a stale flag cannot mask the invalidation below.
    parent.getBounds();
    node.getBounds();

    const nodeContentBefore = node._contentRevision;
    const parentContentBefore = parent._contentRevision;

    node.setLocalBounds(0, 0, 16, 24);

    expect(node._contentRevision).toBeGreaterThan(nodeContentBefore);
    expect(parent._contentRevision).toBeGreaterThan(parentContentBefore);

    // The cascade must reach the node's OWN bounds and its ancestors', so a
    // cull/hit-test reading either after the write sees the new extent.
    expect(node.getBounds().width).toBe(16);
    expect(node.getBounds().height).toBe(24);
    expect(parent.getBounds().width).toBe(16);
    expect(parent.getBounds().height).toBe(24);

    parent.destroy();
  });

  test('feeds the local-space hit test of a rotated node', () => {
    const node = new Drawable();

    node.setLocalBounds(0, 0, 40, 20);
    node.setRotation(45);

    // Rotated off-axis: contains() maps the world point back through the
    // inverse transform and tests it against the freshly written local
    // rectangle, so a point in the empty AABB corner must miss.
    expect(node.contains(21, -7)).toBe(true);
    expect(node.contains(1, 13)).toBe(false);

    node.destroy();
  });
});
