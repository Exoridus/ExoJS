import { NodeRevision } from '#core/NodeRevision';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { RetainedContainer } from '#rendering/RetainedContainer';

/** Build a parent chain of `depth` containers with a Drawable leaf at the bottom. */
const buildChain = (depth: number): { root: Container; leaf: Drawable } => {
  const root = new Container();
  let current = root;

  for (let level = 1; level < depth; level++) {
    const next = new Container();

    current.addChild(next);
    current = next;
  }

  const leaf = new Drawable();

  current.addChild(leaf);

  return { root, leaf };
};

describe('SceneNode dirty-walk epoch early-out (F10)', () => {
  test('N mutations of the same deep leaf between consumer reads stamp O(depth + N), not O(N * depth)', () => {
    const depth = 20;
    const mutations = 10;
    const { root, leaf } = buildChain(depth);

    // Consumer read: starts a fresh epoch (like a plan build would).
    void root._contentRevision;

    const touchSpy = vi.spyOn(NodeRevision.prototype, 'touchContent');

    for (let index = 1; index <= mutations; index++) {
      leaf.setPosition(index, index);
    }

    // First mutation walks the full chain once; every later mutation stops at
    // the first epoch-current ancestor (the leaf's parent), i.e. stamps only
    // the leaf itself. `3 * mutations` slack absorbs the fact that a single
    // setPosition routes through _markContentDirty more than once.
    const stampCount = touchSpy.mock.calls.length;

    expect(stampCount).toBeLessThanOrEqual(depth + 1 + 3 * mutations);
    // Sanity floor: the old behavior would stamp every ancestor per mutation.
    expect(stampCount).toBeLessThan(mutations * depth);

    touchSpy.mockRestore();
    root.destroy();
  });

  test('correctness: ancestors observe a revision change after batched mutations, and a read re-arms the walk', () => {
    const { root, leaf } = buildChain(5);

    const before = root._contentRevision; // read -> new epoch

    leaf.setPosition(1, 1);
    leaf.setPosition(2, 2); // early-out: root keeps the FIRST stamp

    const afterBatch = root._contentRevision; // consumer observes the change

    expect(afterBatch).toBeGreaterThan(before);

    // The read above re-armed the walk: the next mutation must advance the
    // root revision AGAIN, otherwise a consumer that cached `afterBatch`
    // would wrongly see the tree as clean.
    leaf.setPosition(3, 3);

    expect(root._contentRevision).toBeGreaterThan(afterBatch);

    root.destroy();
  });

  test('two dirty paths in one epoch each get their own full walk (stamps ~ O(unique dirty paths))', () => {
    const root = new Container();
    const branchA = new Container();
    const branchB = new Container();
    const leafA = new Drawable();
    const leafB = new Drawable();

    root.addChild(branchA);
    root.addChild(branchB);
    branchA.addChild(leafA);
    branchB.addChild(leafB);

    void root._contentRevision; // fresh epoch

    const beforeA = branchA._contentRevision;
    const beforeB = branchB._contentRevision;

    void root._contentRevision; // re-arm after the reads above

    leafA.setPosition(1, 1);
    leafB.setPosition(1, 1); // different path: must NOT be early-outed away

    expect(branchA._contentRevision).toBeGreaterThan(beforeA);
    expect(branchB._contentRevision).toBeGreaterThan(beforeB);

    root.destroy();
  });

  test('a structure mutation is not blocked by an earlier content walk in the same epoch', () => {
    const { root, leaf } = buildChain(5);

    const structureBefore = root._structureRevision; // read -> new epoch

    leaf.setPosition(1, 1); // content walk stamps the chain's CONTENT epoch
    leaf.visible = false; // structure walk must still stamp structure fully

    expect(root._structureRevision).toBeGreaterThan(structureBefore);

    root.destroy();
  });

  test('a content mutation after a structure walk early-outs safely (structure stamps content too)', () => {
    const { root, leaf } = buildChain(5);

    const contentBefore = root._contentRevision; // read -> new epoch

    leaf.visible = false; // structure walk: stamps structure AND content
    leaf.setPosition(1, 1); // content walk may early-out immediately

    // The consumer still observes a content change relative to its last read.
    expect(root._contentRevision).toBeGreaterThan(contentBefore);

    root.destroy();
  });

  test('the walk stays THROUGH transform-group boundaries (nested snapshots depend on it)', () => {
    const root = new Container();
    const group = new RetainedContainer();
    const leaf = new Drawable();

    root.addChild(group);
    group.addChild(leaf);

    const rootBefore = root._contentRevision; // read -> new epoch
    const groupBefore = group._contentRevision;

    void root._contentRevision; // re-arm

    leaf.setPosition(9, 9);

    // Both the boundary node AND its ancestors above it must be stamped —
    // no boundary stop in the dirty walk (D7 superseded).
    expect(group._contentRevision).toBeGreaterThan(groupBefore);
    expect(root._contentRevision).toBeGreaterThan(rootBefore);

    root.destroy();
  });
});
