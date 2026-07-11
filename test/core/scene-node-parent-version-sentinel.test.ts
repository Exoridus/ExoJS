import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';

/**
 * Test double for a transform-group boundary whose engagement flips at
 * runtime — mirrors RetainedContainer's live `_isTransformGroupBoundary`
 * getter without a render backend.
 */
class ToggleBoundary extends Container {
  public engaged = true;

  public override get _isTransformGroupBoundary(): boolean {
    return this.engaged;
  }
}

/** Exposes the protected transform-version counter for the sentinel invariant. */
class VersionProbe extends Drawable {
  public get transformVersion(): number {
    return this._globalTransformVersion;
  }
}

/**
 * Regression coverage for finding T3 (expert review 2026-07-11,
 * 01-rendering-core.md): `getGlobalTransform()` encodes "no parent contributes
 * to my world matrix" as `parentVersion = 0`. Before the fix the per-node
 * `_globalTransformVersion` counter ALSO started at 0, so the sentinel
 * collided with the natural initial version of a never-resolved parent. The
 * collision was masked only because `parent.getGlobalTransform()` is evaluated
 * BEFORE `parentVersion` is read (forcing the parent to >= 1) — a statement
 * ordering a future refactor could silently break, re-introducing a stale
 * transform on a boundary flip.
 *
 * The fix makes the sentinel structurally distinct: real versions start at 1
 * and only increment, so 0 is unreachable as a legitimate version and the
 * boundary-flip compare is collision-free regardless of read order.
 */
describe('SceneNode getGlobalTransform: no-parent sentinel cannot collide with a real version (T3)', () => {
  test('a never-resolved node reports a transform version distinct from the no-parent sentinel (0)', () => {
    const node = new VersionProbe();

    // getGlobalTransform() uses 0 to mean "no parent contribution". A real
    // _globalTransformVersion must therefore never be 0, or a boundary flip
    // that reads a still-unresolved parent's version could false-clean-skip
    // the child's first world-space resolve.
    expect(node.transformVersion).not.toBe(0);

    node.destroy();
  });

  test('the version stays clear of the sentinel across resolves and mutations', () => {
    const parent = new Container();
    const node = new VersionProbe();

    parent.addChild(node);

    expect(node.transformVersion).not.toBe(0);

    node.getGlobalTransform();
    expect(node.transformVersion).not.toBe(0);

    node.setPosition(10, 20);
    node.getGlobalTransform();
    expect(node.transformVersion).not.toBe(0);

    parent.destroy();
  });

  test('disengaging a boundary forces a child that stored the sentinel to recompute against the parent', () => {
    const world = new Container();
    const group = new ToggleBoundary();
    const child = new VersionProbe();

    world.setPosition(100, 0);
    group.setPosition(40, 0);
    child.setPosition(5, 0);

    world.addChild(group);
    group.addChild(child);

    // Engaged: child is group-local, so it stores the no-parent sentinel as
    // its combined-parent version.
    expect(child.getGlobalTransform().x).toBe(5);

    // Flip the boundary off: the child must now compose the parent chain. This
    // exercises the exact seam T3 guards — a false-clean skip here would leave
    // the child rendering in the stale group-local space.
    group.engaged = false;

    expect(child.getGlobalTransform().x).toBe(145);

    world.destroy();
  });
});
