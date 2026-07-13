import { logger } from '#core/logging';
import { SceneNode } from '#core/SceneNode';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { Graphics } from '#rendering/primitives/Graphics';
import type { RenderBackend } from '#rendering/RenderBackend';

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

  // #310: using a destroyed node is otherwise silent — warn once (dev only) at
  // the attach site, the earliest clear signal of use-after-destroy. Asserted
  // through a sink (which honours the logger's `once` dedup), not a warn spy
  // (which would count calls before dedup).
  describe('destroyed-child guard (#310)', () => {
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
