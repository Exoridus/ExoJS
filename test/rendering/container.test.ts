import type { Application } from '#core/Application';
import { SceneNode } from '#core/SceneNode';
import type { InteractionHooks, Stage } from '#core/Stage';
import { FocusController } from '#input/FocusController';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { ColorMatrixFilter } from '#rendering/filters/ColorMatrixFilter';
import { Graphics } from '#rendering/primitives/Graphics';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderNode } from '#rendering/RenderNode';

class DummyDrawable extends Drawable {
  public override render(_backend: RenderBackend): this {
    return this;
  }
}

describe('Container', () => {
  test('is a non-renderable scene node, not a drawable', () => {
    const container = new Container();

    expect(container).toBeInstanceOf(SceneNode);
    expect(container).not.toBeInstanceOf(Drawable);
  });

  test('Graphics remains a Container-based grouping node', () => {
    const graphics = new Graphics();

    expect(graphics).toBeInstanceOf(Container);
    expect(graphics).not.toBeInstanceOf(Drawable);
  });

  test('swapChildren swaps positions correctly', () => {
    const container = new Container();
    const first = new DummyDrawable();
    const second = new DummyDrawable();

    container.addChild(first);
    container.addChild(second);
    container.swapChildren(first, second);

    expect(container.getChildAt(0)).toBe(second);
    expect(container.getChildAt(1)).toBe(first);
  });

  test('removeChildAt clears parent reference', () => {
    const container = new Container();
    const child = new DummyDrawable();

    container.addChild(child);
    container.removeChildAt(0);

    expect(child.parent).toBeNull();
    expect(container.children.length).toBe(0);
  });

  test('addChild sets the child parent via the internal _setParent path', () => {
    const container = new Container();
    const child = new DummyDrawable();

    container.addChild(child);

    expect(child.parent).toBe(container);
  });

  test('parent has no public setter — assigning it throws, not just a type error', () => {
    const container = new Container();
    const child = new DummyDrawable();

    expect(() => {
      // @ts-expect-error - `parent` has no public setter; use addChild/removeChild.
      child.parent = container;
    }).toThrow(TypeError);

    expect(child.parent).toBeNull();
  });

  test('random add/remove/setChildIndex sequences keep parent and children-view invariants consistent', () => {
    // Spec-mandated property test (deterministic seeded PRNG, no flakiness):
    // after every mutation in a long random sequence, every node in
    // container.children must have .parent === container, and every node
    // NOT in container.children must not. This exercises exactly the code
    // paths this task touches (_setParent calls in addChildAt/removeChildAt,
    // _childrenView invalidation in setChildIndex) under adversarial ordering.
    const container = new Container();
    const pool = Array.from({ length: 8 }, () => new DummyDrawable());
    let seed = 42;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    for (let step = 0; step < 200; step++) {
      const action = Math.floor(random() * 3);

      if (action === 0 || container.children.length === 0) {
        const child = pool[Math.floor(random() * pool.length)]!;
        if (child.parent !== container) {
          container.addChild(child);
        }
      } else if (action === 1) {
        container.removeChildAt(Math.floor(random() * container.children.length));
      } else if (container.children.length > 1) {
        container.setChildIndex(container.getChildAt(0), Math.floor(random() * container.children.length));
      }

      for (const child of container.children) {
        expect(child.parent).toBe(container);
      }

      for (const candidate of pool) {
        if (!container.children.includes(candidate)) {
          expect(candidate.parent).not.toBe(container);
        }
      }
    }
  });

  test('removeChildren clears parent references in range', () => {
    const container = new Container();
    const first = new DummyDrawable();
    const second = new DummyDrawable();
    const third = new DummyDrawable();

    container.addChild(first);
    container.addChild(second);
    container.addChild(third);

    container.removeChildren(0, 2);

    expect(first.parent).toBeNull();
    expect(second.parent).toBeNull();
    expect(third.parent).toBe(container);
    expect(container.children.length).toBe(1);
  });

  test('setChildIndex moves a child within the child list', () => {
    const container = new Container();
    const first = new DummyDrawable();
    const second = new DummyDrawable();
    const third = new DummyDrawable();

    container.addChild(first);
    container.addChild(second);
    container.addChild(third);
    container.setChildIndex(third, 0);

    expect(container.children).toEqual([third, first, second]);
  });

  // Attaching an already-destroyed node used to be silent in production - a
  // __DEV__-only warning fired, then the node was linked into the tree anyway.
  // The engine is pre-1.0 and favours clean breaks, so use-after-destroy is
  // now rejected via `invariant`, which throws in EVERY build (unlike the
  // __DEV__-stripped `assert`) - see `invariant`'s contract in `#core/dev`.
  describe('destroyed-child guard', () => {
    test('addChild throws when the child was already destroy()ed', () => {
      const container = new Container();
      const child = new DummyDrawable();
      child.destroy();

      expect(() => container.addChild(child)).toThrow(/destroy/i);
    });

    test('addChildAt throws and leaves the container and the destroyed node untouched', () => {
      const container = new Container();
      const survivor = new DummyDrawable();
      container.addChild(survivor);

      const destroyedChild = new DummyDrawable();
      destroyedChild.destroy();

      expect(() => container.addChildAt(destroyedChild, 0)).toThrow(/destroy/i);
      expect(container.children).toEqual([survivor]);
      expect(destroyedChild.parent).toBeNull();
    });

    test('does not throw when a live node is added', () => {
      expect(() => new Container().addChild(new DummyDrawable())).not.toThrow();
    });
  });
});

describe('Container children view', () => {
  test('returns the same array reference across repeated reads with no structural change', () => {
    const container = new Container();
    container.addChild(new DummyDrawable());

    expect(container.children).toBe(container.children);
  });

  test.each([
    { name: 'addChild', mutate: (c: Container) => c.addChild(new DummyDrawable()) },
    { name: 'removeChildAt', mutate: (c: Container) => c.removeChildAt(0) },
    { name: 'removeChildren', mutate: (c: Container) => c.removeChildren() },
    { name: 'setChildIndex', mutate: (c: Container) => c.setChildIndex(c.getChildAt(1), 0) },
    { name: 'swapChildren', mutate: (c: Container) => c.swapChildren(c.getChildAt(0), c.getChildAt(1)) },
  ])('invalidates the cached view on $name', ({ mutate }) => {
    const container = new Container();
    container.addChild(new DummyDrawable());
    container.addChild(new DummyDrawable());
    const before = container.children;

    mutate(container);

    expect(container.children).not.toBe(before);
  });

  test('a snapshot handed out earlier is independent of later child mutations', () => {
    const container = new Container();
    const first = new DummyDrawable();
    container.addChild(first);
    const before = container.children;

    container.addChild(new DummyDrawable());
    container.removeChild(first);

    expect(before).toEqual([first]);
  });

  test('is a real Array — Array.isArray, length, and indexed access all work like before', () => {
    const container = new Container();
    const first = new DummyDrawable();
    container.addChild(first);

    expect(Array.isArray(container.children)).toBe(true);
    expect(container.children.length).toBe(1);
    expect(container.children[0]).toBe(first);
  });

  test('mutating children directly is rejected at both the type level and at runtime', () => {
    const container = new Container();

    expect(() => {
      // @ts-expect-error - `children` is `readonly RenderNode[]`; mutate via addChild/removeChild instead.
      container.children.push(new DummyDrawable());
    }).toThrow(TypeError);
  });

  // Regression for the whole-branch review finding: removeChildAt used to
  // splice `_children` and run every removal side effect (bounds cascade,
  // _setParent(null), interaction notify, focus notify) BEFORE invalidating
  // `_childrenView` - invalidation was the very last statement in the
  // method. The stage's focus manager's `_notifyNodeRemoved` synchronously
  // dispatches the public `onBlur` signal, i.e. arbitrary user code, from
  // inside that window. A handler reading `container.children` from onBlur
  // would therefore see the STALE cached snapshot (still containing the
  // node being removed). This test focuses the child being removed so
  // `onBlur` fires synchronously from inside `removeChildAt`, and asserts
  // the handler already observes the post-removal list - which only holds
  // if the cache was invalidated before the focus notify runs, not merely
  // by the time `removeChildAt` returns.
  test('the children-view cache is already invalidated when a synchronous onBlur handler runs during removeChildAt', () => {
    const noopInteraction: InteractionHooks = {
      _notifyNodeAdded() {},
      _notifyNodeRemoved() {},
      _notifyInteractiveChanged() {},
      _notifyBoundsInvalidated() {},
      _notifyTransformGroupMoved() {},
    };
    const stubInput = { onKeyDown: { add() {}, remove() {} }, onKeyUp: { add() {}, remove() {} }, onAnyGamepadButtonDown: { add() {}, remove() {} } };
    const focusApp = { input: stubInput } as unknown as Application;
    const focus = new FocusController(focusApp);
    const stage: Stage = { interaction: noopInteraction, focus };

    const container = new Container();
    container._setStage(stage);

    const child = new DummyDrawable();
    child.focusable = true;
    container.addChild(child);
    focus.focus(child);

    // Populate the cache BEFORE removal - without this, `_childrenView` is
    // still null going into removeChildAt and the getter would compute a
    // fresh (already-correct) array on first read regardless of where the
    // invalidation line sits, silently defeating the regression check.
    const before = container.children;
    expect(before).toContain(child);

    let seenDuringBlur: readonly RenderNode[] | undefined;
    child.onBlur.add(() => {
      seenDuringBlur = container.children;
    });

    container.removeChildAt(0);

    expect(seenDuringBlur).toBeDefined();
    expect(seenDuringBlur).not.toBe(before);
    expect(seenDuringBlur).not.toContain(child);
    expect(seenDuringBlur!.length).toBe(0);
  });
});

// `_childrenInPaintOrder`/`_invalidateChildOrder`/the `getChildIndex` map cache
// move InteractionManager's per-hit-test sort onto Container itself. These
// tests pin down the cache's own correctness independent of any one consumer.
describe('Container paint-order cache', () => {
  test('equal zIndex returns the same reference as the document-order view — no allocation, no sort', () => {
    const container = new Container();
    container.addChild(new DummyDrawable());
    container.addChild(new DummyDrawable());

    expect(container._childrenInPaintOrder()).toBe(container.children);
  });

  test('mixed zIndex sorts by z ascending, ties broken by document order (stable sort)', () => {
    const container = new Container();
    const a = new DummyDrawable();
    const b = new DummyDrawable();
    const c = new DummyDrawable();
    const d = new DummyDrawable();

    container.addChild(a);
    container.addChild(b);
    container.addChild(c);
    container.addChild(d);
    b.zIndex = 5;
    d.zIndex = 5;

    // a/c share z=0 and keep their relative document order; b/d share z=5 and
    // do the same - a stable sort, not merely "sorted by z". Asserted by
    // IDENTITY (not `toEqual`): `a`/`c` (and `b`/`d`) are otherwise
    // indistinguishable `DummyDrawable` instances, so a structural-equality
    // assertion here would pass even for a wrongly-swapped tie (e.g.
    // `[c, a, d, b]`) and silently fail to verify stability at all.
    const order = container._childrenInPaintOrder();

    expect(order[0]).toBe(a);
    expect(order[1]).toBe(c);
    expect(order[2]).toBe(b);
    expect(order[3]).toBe(d);
  });

  test('repeated reads reuse the exact same paint-order snapshot when nothing changed', () => {
    const container = new Container();
    const a = new DummyDrawable();
    const b = new DummyDrawable();

    container.addChild(a);
    container.addChild(b);
    b.zIndex = 3; // force the sorted (non-passthrough) branch

    const first = container._childrenInPaintOrder();

    expect(container._childrenInPaintOrder()).toBe(first);
    expect(container._childrenInPaintOrder()).toBe(first);
  });

  test('does not re-sort on repeated reads of a wide, mixed-z sibling set', () => {
    const container = new Container();
    const siblings = Array.from({ length: 50 }, () => new DummyDrawable());

    for (const sibling of siblings) {
      container.addChild(sibling);
    }
    siblings[10]!.zIndex = 7; // force the mixed-z sorted branch

    const sortSpy = vi.spyOn(Array.prototype, 'sort');

    try {
      for (let i = 0; i < 10; i++) {
        container._childrenInPaintOrder();
      }

      // A cache that silently re-sorted on every read (the bug this cache
      // exists to remove) would call sort 10 times here, not 1.
      expect(sortSpy).toHaveBeenCalledTimes(1);
    } finally {
      sortSpy.mockRestore();
    }
  });

  test.each([
    { name: 'addChild', mutate: (c: Container) => c.addChild(new DummyDrawable()) },
    { name: 'removeChildAt', mutate: (c: Container) => c.removeChildAt(0) },
    { name: 'removeChildren', mutate: (c: Container) => c.removeChildren() },
    { name: 'setChildIndex', mutate: (c: Container) => c.setChildIndex(c.getChildAt(1), 0) },
    { name: 'swapChildren', mutate: (c: Container) => c.swapChildren(c.getChildAt(0), c.getChildAt(1)) },
  ])('invalidates the cached paint-order view on $name', ({ mutate }) => {
    const container = new Container();
    const a = new DummyDrawable();
    const b = new DummyDrawable();

    container.addChild(a);
    container.addChild(b);
    b.zIndex = 5; // force the sorted branch so the cached view differs from `.children`

    const before = container._childrenInPaintOrder();

    mutate(container);

    expect(container._childrenInPaintOrder()).not.toBe(before);
  });

  test('reparenting a child (addChild onto a new parent) invalidates BOTH the old and new parent caches', () => {
    const containerA = new Container();
    const containerB = new Container();
    const staying = new DummyDrawable();
    const moving = new DummyDrawable();
    const existing = new DummyDrawable();

    containerA.addChild(staying);
    containerA.addChild(moving);
    containerB.addChild(existing);
    // Force the sorted branch on both sides so the cached views are
    // genuinely populated (not merely the `.children` passthrough).
    moving.zIndex = 5;
    existing.zIndex = 5;

    const beforeA = containerA._childrenInPaintOrder();
    const beforeB = containerB._childrenInPaintOrder();

    // addChild() on containerB detaches `moving` from containerA first
    // (Container.addChildAt: `if (child.parent) child.parent.removeChild(child);`),
    // so this single call must invalidate both containers' caches.
    containerB.addChild(moving);

    expect(containerA._childrenInPaintOrder()).not.toBe(beforeA);
    expect(containerA.children).toEqual([staying]);
    expect(containerB._childrenInPaintOrder()).not.toBe(beforeB);
    expect(containerB.children).toEqual([existing, moving]);
    expect(moving.parent).toBe(containerB);
  });

  test('a child zIndex change invalidates the paint-order cache ONLY, leaving the document-order snapshot stable', () => {
    const container = new Container();
    const a = new DummyDrawable();
    const b = new DummyDrawable();

    container.addChild(a);
    container.addChild(b);

    const childrenBefore = container.children;
    const paintBefore = container._childrenInPaintOrder();

    expect(container.getChildIndex(b)).toBe(1); // populate the child-index cache

    a.zIndex = 9;

    // A zIndex write changes neither document order nor any child index, so
    // the `children` snapshot must keep the reference stability its own doc
    // comment promises ("the same array reference until the next STRUCTURAL
    // change") - only the paint order actually became stale.
    expect(container.children).toBe(childrenBefore);
    expect(container._childrenInPaintOrder()).not.toBe(paintBefore);
    expect(container._childrenInPaintOrder()).toEqual([b, a]);
    // Document order itself is untouched by a zIndex change.
    expect(container.getChildIndex(a)).toBe(0);
    expect(container.getChildIndex(b)).toBe(1);
  });

  test('changing zIndex on a node with no parent is a no-op, not a crash', () => {
    const root = new DummyDrawable();

    expect(() => {
      root.zIndex = 5;
    }).not.toThrow();
  });

  test('getChildIndex stays correct after a structural mutation invalidates the cached index map', () => {
    const container = new Container();
    const a = new DummyDrawable();
    const b = new DummyDrawable();
    const c = new DummyDrawable();

    container.addChild(a);
    container.addChild(b);
    container.addChild(c);

    expect(container.getChildIndex(c)).toBe(2); // populate the cache

    container.removeChildAt(0); // removes `a`; `b`/`c` shift down

    expect(container.getChildIndex(b)).toBe(0);
    expect(container.getChildIndex(c)).toBe(1);
  });
});

// A 100x100 local-space box, so the geometry accessors below have a nontrivial
// extent to aggregate.
class SizedDrawable extends Drawable {
  public override updateBounds(): this {
    this._setLocalBounds(0, 0, 100, 100);

    return super.updateBounds();
  }

  public override render(_backend: RenderBackend): this {
    return this;
  }
}

describe('Container geometry accessors', () => {
  test('width/height report the rendered world extent, not the extent times scale', () => {
    const container = new Container();

    container.addChild(new SizedDrawable());
    container.setScale(2, 3);

    // The subtree aggregate is already world-space: a 100x100 child under a
    // 2x/3x container renders 200x300. Multiplying by scale a second time
    // would report 400x900.
    expect(container.width).toBe(200);
    expect(container.height).toBe(300);
    expect(container.width).toBe(container.getBounds().width);
    expect(container.height).toBe(container.getBounds().height);

    container.destroy();
  });

  test('assigning width/height relates linearly to the resulting rendered size', () => {
    const container = new Container();

    container.addChild(new SizedDrawable());

    expect(container.width).toBe(100);

    container.width = 200;

    expect(container.width).toBe(200);
    expect(container.getBounds().width).toBe(200);

    // Doubling the CURRENT width must double the rendered size. Dividing the
    // target by an already-scaled measurement instead squares the factor, so
    // this second round trip is where the quadratic relationship shows up.
    container.width = container.width * 2;

    expect(container.width).toBe(400);
    expect(container.getBounds().width).toBe(400);

    container.height = 50;

    expect(container.height).toBe(50);
    expect(container.getBounds().height).toBe(50);

    container.destroy();
  });

  test('assigning width preserves a mirrored scale sign', () => {
    const container = new Container();

    container.addChild(new SizedDrawable());
    container.setScale(-1, 1);

    expect(container.width).toBe(100);

    container.width = 250;

    expect(container.scale.x).toBe(-2.5);
    expect(container.width).toBe(250);

    container.destroy();
  });

  test('assigning width to an empty container is a no-op instead of poisoning scale with NaN', () => {
    const container = new Container();

    container.width = 200;
    container.height = 200;

    expect(container.scale.x).toBe(1);
    expect(container.scale.y).toBe(1);

    container.destroy();
  });

  test('left/top/right/bottom are the world bounds edges for a non-zero origin', () => {
    const container = new Container();

    container.addChild(new SizedDrawable());
    // `origin` is in LOCAL pixels: the transform translates by
    // `position - origin * scale`, so the subtree shifts to (-25,-40)-(75,60).
    container.setOrigin(25, 40);

    expect(container.left).toBe(-25);
    expect(container.top).toBe(-40);
    expect(container.right).toBe(75);
    expect(container.bottom).toBe(60);

    container.destroy();
  });

  test('left/top/right/bottom stay mutually consistent under origin, scale and position', () => {
    const container = new Container();

    container.addChild(new SizedDrawable());
    container.setOrigin(25, 40);
    container.setScale(2, 3);
    container.setPosition(10, 20);

    const bounds = container.getBounds();

    expect(container.left).toBe(bounds.x);
    expect(container.top).toBe(bounds.y);
    expect(container.right).toBe(bounds.x + bounds.width);
    expect(container.bottom).toBe(bounds.y + bounds.height);

    // The edges must span exactly the reported size - the invariant the
    // mismatched origin terms used to break.
    expect(container.right - container.left).toBe(container.width);
    expect(container.bottom - container.top).toBe(container.height);

    container.destroy();
  });

  test('edges follow a child that moves the aggregate', () => {
    const container = new Container();
    const near = new SizedDrawable();
    const far = new SizedDrawable();

    far.setPosition(200, 200);
    container.addChild(near, far);

    expect(container.left).toBe(0);
    expect(container.top).toBe(0);
    expect(container.right).toBe(300);
    expect(container.bottom).toBe(300);
    expect(container.width).toBe(300);

    container.destroy();
  });
});

describe('Container.destroy() tears down the whole subtree', () => {
  test('every descendant is destroyed, not merely detached', () => {
    const root = new Container();
    const branch = new Container();
    const leaf = new DummyDrawable();
    const sibling = new DummyDrawable();

    branch.addChild(leaf);
    root.addChild(branch, sibling);

    const branchSpy = vi.spyOn(branch, 'destroy');
    const leafSpy = vi.spyOn(leaf, 'destroy');
    const siblingSpy = vi.spyOn(sibling, 'destroy');

    root.destroy();

    expect(branchSpy).toHaveBeenCalledTimes(1);
    expect(leafSpy).toHaveBeenCalledTimes(1);
    expect(siblingSpy).toHaveBeenCalledTimes(1);

    expect(root.destroyed).toBe(true);
    expect(branch.destroyed).toBe(true);
    expect(leaf.destroyed).toBe(true);
    expect(sibling.destroyed).toBe(true);
  });

  test('a grandchild-held disposable resource is released', () => {
    const root = new Container();
    const branch = new Container();
    const leaf = new DummyDrawable();
    const filter = new ColorMatrixFilter();
    const filterSpy = vi.spyOn(filter, 'destroy');

    leaf.filters = [filter];
    branch.addChild(leaf);
    root.addChild(branch);

    root.destroy();

    // RenderNode.destroy() releases a node's own filters, so this only fires
    // if the grandchild was genuinely destroyed rather than just unlinked.
    expect(filterSpy).toHaveBeenCalled();
  });

  test('descendants are detached as well as destroyed', () => {
    const root = new Container();
    const branch = new Container();
    const leaf = new DummyDrawable();

    branch.addChild(leaf);
    root.addChild(branch);

    root.destroy();

    expect(root.children).toHaveLength(0);
    expect(branch.parent).toBeNull();
  });

  test('an already-destroyed child is not destroyed a second time', () => {
    const root = new Container();
    const leaf = new DummyDrawable();

    root.addChild(leaf);
    leaf.destroy();

    const leafSpy = vi.spyOn(leaf, 'destroy');

    expect(() => root.destroy()).not.toThrow();
    expect(leafSpy).not.toHaveBeenCalled();
  });

  test('destroying an already-destroyed container is a no-op', () => {
    const root = new Container();
    const leaf = new DummyDrawable();

    root.addChild(leaf);
    root.destroy();

    const leafSpy = vi.spyOn(leaf, 'destroy');

    expect(() => root.destroy()).not.toThrow();
    expect(leafSpy).not.toHaveBeenCalled();
  });

  test('a deep chain is destroyed all the way down', () => {
    const root = new Container();
    const nodes: Container[] = [root];

    for (let depth = 0; depth < 5; depth++) {
      const next = new Container();

      nodes[nodes.length - 1]!.addChild(next);
      nodes.push(next);
    }

    const leaf = new DummyDrawable();

    nodes[nodes.length - 1]!.addChild(leaf);

    root.destroy();

    for (const node of nodes) {
      expect(node.destroyed).toBe(true);
    }

    expect(leaf.destroyed).toBe(true);
  });
});

// A node that stays linked into its parent's child list after `destroy()` is
// the root of a whole family of stale-state bugs: nothing bumps the parent's
// structure revision, so every cache keyed on it (a container's retained draw
// slots, a RetainedContainer's recorded instruction set) keeps replaying the
// dead node. `destroy()` therefore unlinks first, which makes the misuse
// self-correcting instead of silently wrong.
describe('SceneNode.destroy() detaches the node from its parent', () => {
  test('destroying a still-attached drawable clears its parent and drops it from the child list', () => {
    const container = new Container();
    const child = new DummyDrawable();
    const sibling = new DummyDrawable();

    container.addChild(child, sibling);

    child.destroy();

    expect(child.parent).toBeNull();
    expect(container.children).toEqual([sibling]);
    expect(sibling.destroyed).toBe(false);
  });

  test('destroying a still-attached container clears its parent and drops it from the child list', () => {
    const root = new Container();
    const branch = new Container();

    branch.addChild(new DummyDrawable());
    root.addChild(branch);

    branch.destroy();

    expect(branch.parent).toBeNull();
    expect(root.children).toEqual([]);
  });

  test('the detach bumps the parent structure revision, so caches keyed on it are dropped', () => {
    const container = new Container();
    const child = new DummyDrawable();

    container.addChild(child);

    const before = container._structureRevision;

    child.destroy();

    expect(container._structureRevision).not.toBe(before);
  });

  test('detaching first keeps the removal side effects — the node leaves the interaction and focus registries', () => {
    const container = new Container();
    const child = new DummyDrawable();
    const removed: RenderNode[] = [];
    const focus = new FocusController({
      input: { onKeyDown: { add() {}, remove() {} }, onKeyUp: { add() {}, remove() {} }, onAnyGamepadButtonDown: { add() {}, remove() {} } },
    } as unknown as Application);
    const interaction = {
      _notifyNodeAdded() {},
      _notifyNodeRemoved(node: RenderNode) {
        removed.push(node);
      },
      _notifyInteractiveChanged() {},
      _notifyBoundsInvalidated() {},
      _notifyTransformGroupMoved() {},
    } as unknown as InteractionHooks;
    const stage = { interaction, focus } as unknown as Stage;

    container._setStage(stage);
    container.addChild(child);

    child.destroy();

    expect(removed).toContain(child);
    expect(child._getStage()).toBeNull();
  });

  test('the already-correct removeChild()-then-destroy() order is unaffected', () => {
    const container = new Container();
    const child = new DummyDrawable();

    container.addChild(child);
    container.removeChild(child);

    const revisionAfterRemoval = container._structureRevision;

    expect(() => child.destroy()).not.toThrow();
    expect(child.parent).toBeNull();
    // Nothing left to unlink, so the second pass must not dirty the container.
    expect(container._structureRevision).toBe(revisionAfterRemoval);
  });

  test('destroying an unparented node is a no-op for parent linkage', () => {
    const orphan = new DummyDrawable();

    expect(() => orphan.destroy()).not.toThrow();
    expect(orphan.parent).toBeNull();
  });
});
