import type { Application } from '#core/Application';
import { logger } from '#core/logging';
import { SceneNode } from '#core/SceneNode';
import type { InteractionHooks, Stage } from '#core/Stage';
import { FocusManager } from '#input/FocusManager';
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
    const focus = new FocusManager(focusApp);
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
