import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';

/** Test double for the task-7 RetainedContainer: only the boundary flag. */
class BoundaryContainer extends Container {
  public override get _isTransformGroupBoundary(): boolean {
    return true;
  }
}

describe('transform-group boundary: descendants resolve group-relative transforms', () => {
  test('a child below a boundary ignores the boundary ancestor chain (identity parent)', () => {
    const world = new Container();
    const group = new BoundaryContainer();
    const child = new Drawable();

    world.setPosition(100, 100);
    group.setPosition(40, 0);
    child.setPosition(5, 5);

    world.addChild(group);
    group.addChild(child);

    // Group-relative: only the child's own local transform.
    expect(child.getGlobalTransform().x).toBe(5);
    expect(child.getGlobalTransform().y).toBe(5);
    // The boundary node itself still resolves its REAL world transform.
    expect(group.getGlobalTransform().x).toBe(140);
    expect(group.getGlobalTransform().y).toBe(100);

    world.destroy();
  });

  test('moving the boundary node does not change (or even recompute) a child global transform', () => {
    const group = new BoundaryContainer();
    const child = new Drawable();

    group.addChild(child);
    child.setPosition(5, 5);
    child.getGlobalTransform(); // settle

    const before = child.getGlobalTransform().x;

    group.setPosition(500, 500);

    expect(child.getGlobalTransform().x).toBe(before);

    group.destroy();
  });

  test('a nested plain container below the boundary stays group-relative too', () => {
    const group = new BoundaryContainer();
    const mid = new Container();
    const leaf = new Drawable();

    group.setPosition(300, 0);
    mid.setPosition(10, 0);
    leaf.setPosition(1, 0);

    group.addChild(mid);
    mid.addChild(leaf);

    expect(leaf.getGlobalTransform().x).toBe(11);

    group.destroy();
  });

  test('a barrier-bearing direct child ESCAPES the boundary and stays world-space (D-P4)', () => {
    const group = new BoundaryContainer();
    const clipped = new Drawable();

    group.setPosition(40, 0);
    clipped.setPosition(5, 0);
    clipped.clip = true;
    clipped.clipShape = new Rectangle(0, 0, 8, 8);

    group.addChild(clipped);

    // World-space: group translation + own translation.
    expect(clipped.getGlobalTransform().x).toBe(45);

    // And it follows a group move lazily, like any world-space child.
    group.setPosition(100, 0);

    expect(clipped.getGlobalTransform().x).toBe(105);

    group.destroy();
  });
});

describe('own-transform dirty seam (_markOwnTransformDirty)', () => {
  class GroupLikeContainer extends Container {
    public ownTransformMarks = 0;

    protected override _markOwnTransformDirty(): void {
      // Group semantics preview (task 7): version-bump instead of
      // content-dirtying, but ancestors still get stale-bounds flags.
      this.ownTransformMarks++;
      this._invalidateBoundsFlags();
    }
  }

  test('a subclass can reroute own-transform mutations away from the content revision', () => {
    const node = new GroupLikeContainer();
    const contentBefore = node._contentRevision;

    node.setPosition(10, 10);
    node.setRotation(45);
    node.setScale(2);

    expect(node.ownTransformMarks).toBe(3);
    expect(node._contentRevision).toBe(contentBefore);

    node.destroy();
  });

  test("the default seam keeps today's behavior: setPosition is content-dirty and bounds-cascading", () => {
    const parent = new Container();
    const node = new Drawable();

    parent.addChild(node);
    parent.getBounds(); // settle bounds flags

    const before = node._contentRevision;

    node.setPosition(10, 10);

    expect(node._contentRevision).toBeGreaterThan(before);

    parent.destroy();
  });
});
