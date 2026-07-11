import { Matrix } from '#math/Matrix';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';

/**
 * Test double for a transform-group boundary whose engagement can be flipped
 * at runtime — mirrors RetainedContainer's live `_isTransformGroupBoundary`
 * getter (barrier-driven disengage/re-engage) without needing a render
 * backend harness.
 */
class ToggleBoundary extends Container {
  public engaged = true;

  public override get _isTransformGroupBoundary(): boolean {
    return this.engaged;
  }
}

describe('SceneNode.getWorldTransform: world space through transform-group boundaries', () => {
  test('without any boundary ancestor it returns the exact global-transform matrix (same instance)', () => {
    const root = new Container();
    const mid = new Container();
    const leaf = new Drawable();

    root.setPosition(100, 50);
    mid.setPosition(10, 20);
    leaf.setPosition(1, 2);

    root.addChild(mid);
    mid.addChild(leaf);

    expect(leaf.getWorldTransform()).toBe(leaf.getGlobalTransform());
    expect(leaf.getWorldTransform().x).toBe(111);
    expect(leaf.getWorldTransform().y).toBe(72);

    root.destroy();
  });

  test('a child below a translated boundary resolves world coordinates; getGlobalTransform stays group-local', () => {
    const world = new Container();
    const group = new ToggleBoundary();
    const child = new Drawable();

    world.setPosition(100, 100);
    group.setPosition(40, 0);
    child.setPosition(5, 5);

    world.addChild(group);
    group.addChild(child);

    // Group-local (rendering space) is unchanged by this feature.
    expect(child.getGlobalTransform().x).toBe(5);
    expect(child.getGlobalTransform().y).toBe(5);

    // World space composes through the boundary: world + group + child.
    expect(child.getWorldTransform().x).toBe(145);
    expect(child.getWorldTransform().y).toBe(105);

    world.destroy();
  });

  test('a translated + rotated boundary composes exactly like a manual matrix compose', () => {
    const group = new ToggleBoundary();
    const child = new Drawable();

    group.setPosition(100, 200);
    group.setRotation(90);
    group.setScale(2, 3);
    child.setPosition(5, 7);
    child.setRotation(30);

    group.addChild(child);

    // Oracle: group-local matrix lifted by the boundary's own world matrix —
    // computed through a different code path (getTransform + explicit clone).
    const expected = child.getGlobalTransform().clone().combine(group.getGlobalTransform());
    const actual = child.getWorldTransform();

    expect(actual.a).toBeCloseTo(expected.a, 12);
    expect(actual.b).toBeCloseTo(expected.b, 12);
    expect(actual.c).toBeCloseTo(expected.c, 12);
    expect(actual.d).toBeCloseTo(expected.d, 12);
    expect(actual.x).toBeCloseTo(expected.x, 12);
    expect(actual.y).toBeCloseTo(expected.y, 12);

    group.destroy();
  });

  test('mutating the group invalidates the cached world transform of descendants', () => {
    const group = new ToggleBoundary();
    const mid = new Container();
    const leaf = new Drawable();

    group.setPosition(10, 0);
    mid.setPosition(1, 0);
    leaf.setPosition(0.5, 0);

    group.addChild(mid);
    mid.addChild(leaf);

    expect(leaf.getWorldTransform().x).toBe(11.5);

    group.setPosition(1000, 0);

    expect(leaf.getWorldTransform().x).toBe(1001.5);

    group.destroy();
  });

  test('mutating the node itself (or a mid ancestor inside the group) invalidates the world transform', () => {
    const group = new ToggleBoundary();
    const mid = new Container();
    const leaf = new Drawable();

    group.setPosition(100, 0);
    group.addChild(mid);
    mid.addChild(leaf);

    expect(leaf.getWorldTransform().x).toBe(100);

    leaf.setPosition(7, 0);
    expect(leaf.getWorldTransform().x).toBe(107);

    mid.setPosition(20, 0);
    expect(leaf.getWorldTransform().x).toBe(127);

    group.destroy();
  });

  test('mutating an ancestor ABOVE the boundary invalidates the world transform of nodes inside the group', () => {
    const world = new Container();
    const group = new ToggleBoundary();
    const child = new Drawable();

    world.addChild(group);
    group.addChild(child);

    expect(child.getWorldTransform().x).toBe(0);

    // The flagship use case: world.setPosition(-cameraX, -cameraY).
    world.setPosition(-500, 0);

    expect(child.getWorldTransform().x).toBe(-500);
    // Rendering-space contract untouched.
    expect(child.getGlobalTransform().x).toBe(0);

    world.destroy();
  });

  test('boundary disengage flips descendants back to global === world; re-engage restores the composed path', () => {
    const world = new Container();
    const group = new ToggleBoundary();
    const child = new Drawable();

    world.setPosition(100, 0);
    group.setPosition(40, 0);
    child.setPosition(5, 0);

    world.addChild(group);
    group.addChild(child);

    // Engaged: group-local rendering space, composed world space.
    expect(child.getGlobalTransform().x).toBe(5);
    expect(child.getWorldTransform().x).toBe(145);

    // Barrier-driven disengage (RetainedContainer deep-barrier fallback).
    group.engaged = false;

    expect(child.getGlobalTransform().x).toBe(145);
    expect(child.getWorldTransform().x).toBe(145);
    expect(child.getWorldTransform()).toBe(child.getGlobalTransform());

    // Re-engage: back to the composed path, same world answer.
    group.engaged = true;

    expect(child.getGlobalTransform().x).toBe(5);
    expect(child.getWorldTransform().x).toBe(145);

    world.destroy();
  });

  test('nested groups (boundary inside boundary) compose BOTH group matrices', () => {
    const outer = new ToggleBoundary();
    const inner = new ToggleBoundary();
    const leaf = new Drawable();

    outer.setPosition(100, 0);
    inner.setPosition(10, 0);
    leaf.setPosition(1, 0);

    outer.addChild(inner);
    inner.addChild(leaf);

    // Rendering spaces: leaf is inner-local, inner is outer-local.
    expect(leaf.getGlobalTransform().x).toBe(1);
    expect(inner.getGlobalTransform().x).toBe(10);

    // World spaces compose recursively through every boundary.
    expect(inner.getWorldTransform().x).toBe(110);
    expect(leaf.getWorldTransform().x).toBe(111);

    // Moving the OUTER group shifts both.
    outer.setPosition(1000, 0);

    expect(inner.getWorldTransform().x).toBe(1010);
    expect(leaf.getWorldTransform().x).toBe(1011);

    outer.destroy();
  });

  test('a barrier-bearing direct child ESCAPES the boundary: world === global for it and its subtree', () => {
    const group = new ToggleBoundary();
    const clipped = new Container();
    const grandchild = new Drawable();

    group.setPosition(40, 0);
    clipped.setPosition(5, 0);
    clipped.clip = true;
    clipped.clipShape = new Rectangle(0, 0, 8, 8);
    grandchild.setPosition(1, 0);

    group.addChild(clipped);
    clipped.addChild(grandchild);

    // Escaped: already world-space in the rendering convention (D-P4).
    expect(clipped.getGlobalTransform().x).toBe(45);
    expect(clipped.getWorldTransform().x).toBe(45);
    expect(clipped.getWorldTransform()).toBe(clipped.getGlobalTransform());

    expect(grandchild.getWorldTransform().x).toBe(46);
    expect(grandchild.getWorldTransform()).toBe(grandchild.getGlobalTransform());

    group.destroy();
  });

  test('caching: repeated clean reads return the same matrix instance and perform zero matrix combines', () => {
    const world = new Container();
    const group = new ToggleBoundary();
    const child = new Drawable();

    world.setPosition(100, 0);
    group.setPosition(40, 0);
    child.setPosition(5, 0);

    world.addChild(group);
    group.addChild(child);

    // Settle every cache.
    const first = child.getWorldTransform();

    const combineSpy = vi.spyOn(Matrix.prototype, 'combine');

    for (let i = 0; i < 5; i++) {
      expect(child.getWorldTransform()).toBe(first);
    }

    expect(combineSpy).not.toHaveBeenCalled();

    combineSpy.mockRestore();
    world.destroy();
  });
});
