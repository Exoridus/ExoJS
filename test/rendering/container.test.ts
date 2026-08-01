import type { Application } from '#core/Application';
import { logger } from '#core/logging';
import { SceneNode } from '#core/SceneNode';
import type { InteractionHooks, Stage } from '#core/Stage';
import { FocusController } from '#input/FocusController';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
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
      // @ts-expect-error — `parent` has no public setter; use addChild/removeChild.
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

  // Using a destroyed node is otherwise silent — warn once (dev only) at
  // the attach site, the earliest clear signal of use-after-destroy. Asserted
  // through a sink (which honours the logger's `once` dedup), not a warn spy
  // (which would count calls before dedup).
  describe('destroyed-child guard', () => {
    let entries: string[];
    let removeSink: () => void;

    beforeEach(() => {
      logger._resetOnce(); // fresh once-state per test (dedup is process-wide)
      entries = [];
      removeSink = logger.addSink(e => entries.push(e.message));
    });

    afterEach(() => removeSink());

    const destroyedCount = (): number => entries.filter(m => m.includes('destroyed')).length;

    test('warns exactly once even when multiple destroyed nodes are attached', () => {
      const container = new Container();

      for (let i = 0; i < 3; i++) {
        const child = new DummyDrawable();
        child.destroy();
        container.addChild(child);
      }

      expect(destroyedCount()).toBe(1); // once, despite 3 destroyed attaches
    });

    test('does not warn when a live node is added', () => {
      new Container().addChild(new DummyDrawable());

      expect(destroyedCount()).toBe(0);
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
      // @ts-expect-error — `children` is `readonly RenderNode[]`; mutate via addChild/removeChild instead.
      container.children.push(new DummyDrawable());
    }).toThrow(TypeError);
  });

  // Regression for the whole-branch review finding: removeChildAt used to
  // splice `_children` and run every removal side effect (bounds cascade,
  // _setParent(null), interaction notify, focus notify) BEFORE invalidating
  // `_childrenView` — invalidation was the very last statement in the
  // method. The stage's focus manager's `_notifyNodeRemoved` synchronously
  // dispatches the public `onBlur` signal, i.e. arbitrary user code, from
  // inside that window. A handler reading `container.children` from onBlur
  // would therefore see the STALE cached snapshot (still containing the
  // node being removed). This test focuses the child being removed so
  // `onBlur` fires synchronously from inside `removeChildAt`, and asserts
  // the handler already observes the post-removal list — which only holds
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
    const stubInput = { onKeyDown: { add() {}, remove() {} }, onKeyUp: { add() {}, remove() {} } };
    const focusApp = { input: stubInput } as unknown as Application;
    const focus = new FocusController(focusApp);
    const stage: Stage = { interaction: noopInteraction, focus };

    const container = new Container();
    container._setStage(stage);

    const child = new DummyDrawable();
    child.focusable = true;
    container.addChild(child);
    focus.focus(child);

    // Populate the cache BEFORE removal — without this, `_childrenView` is
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
    // do the same — a stable sort, not merely "sorted by z". Asserted by
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
    // change") — only the paint order actually became stale.
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
