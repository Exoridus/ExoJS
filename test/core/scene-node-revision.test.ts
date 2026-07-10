import { Color } from '#core/Color';
import { nextNodeRevision, NodeRevision } from '#core/NodeRevision';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { BlendModes } from '#rendering/types';

describe('NodeRevision', () => {
  test('starts at 0 for both content and structure', () => {
    const rev = new NodeRevision();

    expect(rev.content).toBe(0);
    expect(rev.structure).toBe(0);
  });

  test('touchContent stamps content only', () => {
    const rev = new NodeRevision();
    const stamp = nextNodeRevision();

    rev.touchContent(stamp);

    expect(rev.content).toBe(stamp);
    expect(rev.structure).toBe(0);
  });

  test('touchStructure stamps both content and structure (structure implies content)', () => {
    const rev = new NodeRevision();
    const stamp = nextNodeRevision();

    rev.touchStructure(stamp);

    expect(rev.content).toBe(stamp);
    expect(rev.structure).toBe(stamp);
  });

  test('nextNodeRevision is strictly increasing across calls', () => {
    const a = nextNodeRevision();
    const b = nextNodeRevision();

    expect(b).toBeGreaterThan(a);
  });
});

describe('SceneNode content/structure revision propagation', () => {
  test('setPosition bumps content revision on the node and every ancestor up to root', () => {
    const root = new Container();
    const mid = new Container();
    const leaf = new Drawable();

    root.addChild(mid);
    mid.addChild(leaf);

    const rootBefore = root._contentRevision;
    const midBefore = mid._contentRevision;
    const rootStructureBefore = root._structureRevision;

    leaf.setPosition(10, 20);

    expect(leaf._contentRevision).toBeGreaterThan(0);
    expect(mid._contentRevision).toBeGreaterThan(midBefore);
    expect(root._contentRevision).toBeGreaterThan(rootBefore);
    // A pure content change must never advance structure (the addChild calls
    // above already stamped structure once each — setPosition must not add another).
    expect(root._structureRevision).toBe(rootStructureBefore);

    leaf.destroy();
    mid.destroy();
    root.destroy();
  });

  test('a sibling subtree untouched by the mutation keeps its own revision unchanged', () => {
    const root = new Container();
    const branchA = new Container();
    const branchB = new Container();

    root.addChild(branchA);
    root.addChild(branchB);

    const branchBBefore = branchB._contentRevision;

    branchA.setPosition(5, 5);

    expect(branchB._contentRevision).toBe(branchBBefore);

    branchA.destroy();
    branchB.destroy();
    root.destroy();
  });
});

describe('visible toggles are structure-dirty', () => {
  test('setting visible to a new value bumps structure revision up to root', () => {
    const root = new Container();
    const leaf = new Drawable();

    root.addChild(leaf);

    const rootStructureBefore = root._structureRevision;

    leaf.visible = false;

    expect(leaf._structureRevision).toBeGreaterThan(0);
    expect(root._structureRevision).toBeGreaterThan(rootStructureBefore);

    root.destroy();
  });

  test('setting visible to its current value is a no-op (no spurious revision bump)', () => {
    const leaf = new Drawable();

    leaf.visible = true; // already the default
    const before = leaf._structureRevision;

    leaf.visible = true;

    expect(leaf._structureRevision).toBe(before);

    leaf.destroy();
  });
});

describe('RenderNode/Drawable content mutations route through invalidateCache -> _markContentDirty', () => {
  test('Drawable.setTint bumps content revision', () => {
    const drawable = new Drawable();
    const before = drawable._contentRevision;

    drawable.setTint(new Color(10, 20, 30));

    expect(drawable._contentRevision).toBeGreaterThan(before);
    drawable.destroy();
  });

  test('Drawable.setBlendMode bumps content revision', () => {
    const drawable = new Drawable();
    const before = drawable._contentRevision;

    drawable.setBlendMode(BlendModes.Add);

    expect(drawable._contentRevision).toBeGreaterThan(before);
    drawable.destroy();
  });

  test('RenderNode.cacheAsBitmap bumps content revision', () => {
    const container = new Container();
    const before = container._contentRevision;

    container.cacheAsBitmap = true;

    expect(container._contentRevision).toBeGreaterThan(before);
    container.destroy();
  });
});

describe('Container structural mutations bump structure revision', () => {
  test("addChild(At) bumps the container's structure revision", () => {
    const container = new Container();
    const before = container._structureRevision;

    container.addChild(new Drawable());

    expect(container._structureRevision).toBeGreaterThan(before);
    container.destroy();
  });

  test('removeChildAt bumps structure revision', () => {
    const container = new Container();
    const child = new Drawable();

    container.addChild(child);
    const before = container._structureRevision;

    container.removeChildAt(0);

    expect(container._structureRevision).toBeGreaterThan(before);
    container.destroy();
  });

  test('removeChildren bumps structure revision', () => {
    const container = new Container();

    container.addChild(new Drawable(), new Drawable());
    const before = container._structureRevision;

    container.removeChildren();

    expect(container._structureRevision).toBeGreaterThan(before);
    container.destroy();
  });

  test('setChildIndex bumps structure revision', () => {
    const container = new Container();
    const a = new Drawable();
    const b = new Drawable();

    container.addChild(a, b);
    const before = container._structureRevision;

    container.setChildIndex(a, 1);

    expect(container._structureRevision).toBeGreaterThan(before);
    container.destroy();
  });

  test('swapChildren bumps structure revision', () => {
    const container = new Container();
    const a = new Drawable();
    const b = new Drawable();

    container.addChild(a, b);
    const before = container._structureRevision;

    container.swapChildren(a, b);

    expect(container._structureRevision).toBeGreaterThan(before);
    container.destroy();
  });
});

describe('RenderNode.invalidateContent (public hook for custom Drawables)', () => {
  test('bumps content revision without needing a standard setter', () => {
    const drawable = new Drawable();
    const before = drawable._contentRevision;

    drawable.invalidateContent();

    expect(drawable._contentRevision).toBeGreaterThan(before);
  });

  test('returns this for chaining', () => {
    const drawable = new Drawable();

    expect(drawable.invalidateContent()).toBe(drawable);
  });
});
