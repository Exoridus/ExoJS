import { detachedNodeDirtyIndex, DirtyChannel, NodeDirtyIndex } from '#core/nodeDirtyIndex';
import type { Stage } from '#core/Stage';
import { Container } from '#rendering/Container';
import { RetainedContainer } from '#rendering/RetainedContainer';

/** A stage bundle carrying nothing but the index - the only service these tests reach through it. */
const stageWith = (dirtyIndex: NodeDirtyIndex): Stage =>
  ({
    interaction: {
      _notifyNodeAdded: () => {},
      _notifyNodeRemoved: () => {},
      _notifyInteractiveChanged: () => {},
      _notifyBoundsInvalidated: () => {},
      _notifyTransformGroupMoved: () => {},
    },
    focus: { _notifyNodeRemoved: () => {} },
    dirtyIndex,
  }) as unknown as Stage;

/** A tree root already attached to a stage of its own, standing in for one application's scene. */
const treeOn = (dirtyIndex: NodeDirtyIndex): Container => {
  const root = new Container();

  root._setStage(stageWith(dirtyIndex));

  return root;
};

describe('two applications on one page', () => {
  test('a retained consumer in one tree leaves the other tree unarmed', () => {
    const first = new NodeDirtyIndex();
    const second = new NodeDirtyIndex();
    const firstTree = treeOn(first);
    const secondTree = treeOn(second);

    secondTree.addChild(new RetainedContainer());

    expect(second.armed).toBe(true);
    expect(first.armed).toBe(false);

    // The cost this isolates: with a process-wide arming count, every mutation
    // in the first tree would write an entry no consumer of it ever reads.
    const moved = new Container();

    firstTree.addChild(moved);

    const cursor = first.sequence;

    moved.setPosition(8, 8);

    expect(first.sequence).toBe(cursor);

    firstTree.destroy();
    secondTree.destroy();
  });

  test('a mark lands in the owning tree index and is invisible to the other', () => {
    const first = new NodeDirtyIndex();
    const second = new NodeDirtyIndex();
    const firstTree = treeOn(first);
    const secondTree = treeOn(second);

    secondTree.addChild(new RetainedContainer());

    const group = new RetainedContainer();

    firstTree.addChild(group);

    const moved = new Container();

    group.addChild(moved);

    const firstCursor = first.sequence;
    const secondCursor = second.sequence;

    moved.setPosition(4, 4);

    expect(first.hasMarksSince(firstCursor, DirtyChannel.Transform)).toBe(true);
    expect(second.hasMarksSince(secondCursor, DirtyChannel.Transform)).toBe(false);

    firstTree.destroy();
    secondTree.destroy();
  });

  test('one application advancing its frames leaves the other window untouched', () => {
    const first = new NodeDirtyIndex();
    const second = new NodeDirtyIndex();
    const firstTree = treeOn(first);

    firstTree.addChild(new RetainedContainer());

    const cursor = first.sequence;

    // More frames than the retained window holds: shared, these would rotate the
    // first application's cursor out and force a full rebuild of its plan.
    for (let frame = 0; frame < 32; frame++) {
      second.advance();
    }

    expect(first.covers(cursor)).toBe(true);

    firstTree.destroy();
  });

  test('a boundary moved between trees arms the tree it joins and disarms the one it left', () => {
    const first = new NodeDirtyIndex();
    const second = new NodeDirtyIndex();
    const firstTree = treeOn(first);
    const secondTree = treeOn(second);
    const group = new RetainedContainer();

    firstTree.addChild(group);

    expect(first.armed).toBe(true);
    expect(second.armed).toBe(false);

    secondTree.addChild(group);

    expect(first.armed).toBe(false);
    expect(second.armed).toBe(true);

    group.destroy();

    expect(second.armed).toBe(false);

    firstTree.destroy();
    secondTree.destroy();
  });

  test('a subtree built detached marks into the application index once it is attached', () => {
    const index = new NodeDirtyIndex();
    const tree = treeOn(index);
    const group = new RetainedContainer();
    const moved = new Container();

    group.addChild(moved);

    const detachedCursor = detachedNodeDirtyIndex.sequence;

    tree.addChild(group);
    moved.setPosition(2, 2);

    expect(index.hasMarksSince(index.sequence - 1, DirtyChannel.Transform)).toBe(true);
    expect(detachedNodeDirtyIndex.hasMarksSince(detachedCursor, DirtyChannel.Transform)).toBe(false);

    tree.destroy();
  });
});
