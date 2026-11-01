import type { Application } from '#core/Application';
import type { InteractionHooks, Stage } from '#core/Stage';
import { FocusController } from '#input/FocusController';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderNode } from '#rendering/RenderNode';

class DummyDrawable extends Drawable {
  public override render(_backend: RenderBackend): this {
    return this;
  }
}

const noopInteraction: InteractionHooks = {
  _notifyNodeAdded() {},
  _notifyNodeRemoved() {},
  _notifyInteractiveChanged() {},
  _notifyBoundsInvalidated() {},
  _notifyTransformGroupMoved() {},
};

/**
 * A stage whose focus controller really dispatches `onBlur`, so removal side
 * effects run genuine user code from inside the structural methods.
 */
const createStage = (): { stage: Stage; focus: FocusController } => {
  const stubInput = {
    onKeyDown: { add() {}, remove() {} },
    onKeyUp: { add() {}, remove() {} },
    onAnyGamepadButtonDown: { add() {}, remove() {} },
  };
  const focus = new FocusController({ input: stubInput } as unknown as Application);

  return { stage: { interaction: noopInteraction, focus }, focus };
};

describe('Container structural methods are atomic against user callbacks', () => {
  test('removeChildren has already committed the array when a synchronous onBlur handler runs', () => {
    const { stage, focus } = createStage();
    const container = new Container();

    container._setStage(stage);

    const first = new DummyDrawable();
    const second = new DummyDrawable();
    const survivor = new DummyDrawable();

    first.focusable = true;
    container.addChild(first, second, survivor);
    focus.focus(first);

    // Populate the view cache before the removal: with a null cache the getter
    // would recompute a correct array on first read regardless of where the
    // invalidation sits, which would defeat the check.
    const before = container.children;

    expect(before).toContain(first);

    let seenDuringBlur: readonly RenderNode[] | undefined;
    let indexDuringBlur: number | undefined;

    first.onBlur.add(() => {
      seenDuringBlur = container.children;
      indexDuringBlur = container.getChildIndex(survivor);
    });

    container.removeChildren(0, 2);

    // `removeChildAt` already commits the splice before notifying; the ranged
    // form ran every notify first and spliced afterwards, so a handler saw a
    // list that still held both nodes being removed.
    expect(seenDuringBlur).toBeDefined();
    expect(seenDuringBlur).not.toContain(first);
    expect(seenDuringBlur).not.toContain(second);
    expect(seenDuringBlur).toEqual([survivor]);
    expect(indexDuringBlur).toBe(0);

    container.destroy();
  });

  test('a same-parent addChildAt reorders without blurring the moved child', () => {
    const { stage, focus } = createStage();
    const container = new Container();

    container._setStage(stage);

    const moved = new DummyDrawable();
    const other = new DummyDrawable();

    moved.focusable = true;
    container.addChild(moved, other);
    focus.focus(moved);

    expect(focus.focused).toBe(moved);

    container.addChildAt(moved, 1);

    // Routing a same-parent insert through removeChild() detaches the node
    // from the stage and blurs it, so a pure reorder silently stole focus.
    expect(container.children).toEqual([other, moved]);
    expect(focus.focused).toBe(moved);

    container.destroy();
  });

  test('a same-parent addChildAt keeps the child attached to the stage throughout', () => {
    const { stage, focus } = createStage();
    const container = new Container();

    container._setStage(stage);

    const moved = new DummyDrawable();
    const other = new DummyDrawable();

    moved.focusable = true;
    container.addChild(moved, other);
    focus.focus(moved);

    let detached = false;

    moved.onBlur.add(() => {
      detached = true;
    });

    container.addChildAt(moved, 1);

    expect(detached).toBe(false);
    expect(moved.parent).toBe(container);

    container.destroy();
  });

  test('addChild appends even when the previous parent`s removal inserts into the target', () => {
    const { stage, focus } = createStage();
    const source = new Container();
    const target = new Container();

    source._setStage(stage);
    target._setStage(stage);

    const existing = new DummyDrawable();
    const injected = new DummyDrawable();
    const moving = new DummyDrawable();

    target.addChild(existing);
    moving.focusable = true;
    source.addChild(moving);
    focus.focus(moving);

    // Detaching `moving` from `source` blurs it, and the handler grows the
    // TARGET list. The append index was captured before that, so the child
    // landed in the middle of the list instead of at the end.
    moving.onBlur.add(() => {
      target.addChild(injected);
    });

    target.addChild(moving);

    expect(target.children).toEqual([existing, injected, moving]);

    source.destroy();
    target.destroy();
  });

  test('addChildAt still honours an explicit index after the previous parent`s removal shrank the list', () => {
    const { stage, focus } = createStage();
    const source = new Container();
    const target = new Container();

    source._setStage(stage);
    target._setStage(stage);

    const doomed = new DummyDrawable();
    const moving = new DummyDrawable();

    target.addChild(doomed);
    moving.focusable = true;
    source.addChild(moving);
    focus.focus(moving);

    moving.onBlur.add(() => {
      target.removeChild(doomed);
    });

    target.addChildAt(moving, 1);

    expect(target.children).toEqual([moving]);

    source.destroy();
    target.destroy();
  });
});

describe('Container removal completes after throwing blur handlers', () => {
  test.each(['single', 'range', 'destroy'])('%s removal releases stage and structure state', mode => {
    const { stage, focus } = createStage();
    const container = new Container();
    const branch = new Container();
    const first = new DummyDrawable();
    const second = new DummyDrawable();

    branch.addChild(first);
    container._setStage(stage);
    container.addChild(branch, second);
    first.focusable = true;
    focus.focus(first);

    const revision = container._structureRevision;
    const error = new Error('blur failed');

    first.onBlur.add(() => {
      throw error;
    });

    expect(() => {
      if (mode === 'single') {
        container.removeChild(branch);
      } else if (mode === 'range') {
        container.removeChildren();
      } else {
        container.destroy();
      }
    }).toThrow(error);

    expect(branch.parent).toBeNull();
    expect(branch._getStage()).toBeNull();
    expect(first._getStage()).toBeNull();
    expect(container._structureRevision).toBeGreaterThan(revision);
    expect(container.children).toEqual(mode === 'single' ? [second] : []);

    if (mode !== 'single') {
      expect(second.parent).toBeNull();
      expect(second._getStage()).toBeNull();
    }

    if (mode === 'destroy') {
      expect(container.destroyed).toBe(true);
      expect(branch.destroyed).toBe(true);
      expect(first.destroyed).toBe(true);
      expect(second.destroyed).toBe(true);
    }

    container.destroy();
  });
});
