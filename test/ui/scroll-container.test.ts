/**
 * ScrollContainer tests — construction defaults, scroll clamping, mouse-wheel
 * routing (direction filtering + in-bounds gating), stage attach/detach
 * subscription lifecycle, and destroy() cleanup.
 */

import type { Application } from '#core/Application';
import { Signal } from '#core/Signal';
import type { Stage } from '#core/Stage';
import { Rectangle } from '#math/Rectangle';
import { Vector } from '#math/Vector';
import { Container } from '#rendering/Container';
import { ScrollContainer } from '#ui/ScrollContainer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Stage whose `app.input` carries a real onMouseWheel Signal. */
const makeStage = (pointerPos: { x: number; y: number } | null | undefined = null): { stage: Stage; onMouseWheel: Signal<[Vector]> } => {
  const onMouseWheel = new Signal<[Vector]>();
  const app = {
    input: {
      onMouseWheel,
      getPrimaryPointerPosition: vi.fn(() => pointerPos),
    },
  } as unknown as Application;

  // Full no-op hook implementations — Container._setStage() propagates the
  // stage to `content` too, and later setPosition() calls (via scrollTo())
  // walk up through these hooks to invalidate bounds.
  const interaction: Stage['interaction'] = {
    _notifyNodeAdded: vi.fn(),
    _notifyNodeRemoved: vi.fn(),
    _notifyInteractiveChanged: vi.fn(),
    _notifyBoundsInvalidated: vi.fn(),
  };
  const focus: Stage['focus'] = {
    focused: null,
    focus: vi.fn(),
    blur: vi.fn(),
    _notifyNodeRemoved: vi.fn(),
  };

  return { stage: { interaction, focus, app }, onMouseWheel };
};

/** Stub both the widget's own bounds and its content bounds for deterministic wheel-routing tests. */
const stubBounds = (scroll: ScrollContainer, ownBounds: Rectangle, contentBounds: Rectangle): void => {
  vi.spyOn(scroll, 'getBounds').mockReturnValue(ownBounds);
  vi.spyOn(scroll.content, 'getBounds').mockReturnValue(contentBounds);
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScrollContainer construction', () => {
  test('takes its explicit layout size and defaults to vertical scrolling', () => {
    const scroll = new ScrollContainer({ width: 300, height: 400 });

    expect(scroll.uiWidth).toBe(300);
    expect(scroll.uiHeight).toBe(400);
    expect(scroll.scrollX).toBe(0);
    expect(scroll.scrollY).toBe(0);
  });

  test('content is a Container distinct from the widget itself', () => {
    const scroll = new ScrollContainer({ width: 100, height: 100 });

    expect(scroll.content).toBeInstanceOf(Container);
    expect(scroll.children).toContain(scroll.content);
  });

  test('is clipped and interactive', () => {
    const scroll = new ScrollContainer({ width: 100, height: 100 });

    expect(scroll.clip).toBe(true);
    expect(scroll.interactive).toBe(true);
  });

  test('accepts an explicit direction option', () => {
    const scroll = new ScrollContainer({ width: 100, height: 100, direction: 'horizontal' });

    // No public getter for direction; verified indirectly via wheel routing below.
    expect(scroll).toBeInstanceOf(ScrollContainer);
  });
});

describe('ScrollContainer.scrollTo / scrollBy', () => {
  test('clamps to the content range', () => {
    const scroll = new ScrollContainer({ width: 100, height: 100 });

    vi.spyOn(scroll.content, 'getBounds').mockReturnValue(new Rectangle(0, 0, 500, 800));

    scroll.scrollTo(1000, 2000);
    expect(scroll.scrollX).toBe(400); // 500 - 100
    expect(scroll.scrollY).toBe(700); // 800 - 100

    scroll.scrollTo(-50, -50);
    expect(scroll.scrollX).toBe(0);
    expect(scroll.scrollY).toBe(0);
  });

  test('clamps to zero when content is smaller than the viewport', () => {
    const scroll = new ScrollContainer({ width: 300, height: 300 });

    vi.spyOn(scroll.content, 'getBounds').mockReturnValue(new Rectangle(0, 0, 50, 50));

    scroll.scrollTo(100, 100);
    expect(scroll.scrollX).toBe(0);
    expect(scroll.scrollY).toBe(0);
  });

  test('positions the content container at the negated scroll offset', () => {
    const scroll = new ScrollContainer({ width: 100, height: 100 });

    vi.spyOn(scroll.content, 'getBounds').mockReturnValue(new Rectangle(0, 0, 500, 500));

    scroll.scrollTo(40, 60);
    expect(scroll.content.position.x).toBe(-40);
    expect(scroll.content.position.y).toBe(-60);
  });

  test('scrollBy() accumulates relative to the current position', () => {
    const scroll = new ScrollContainer({ width: 100, height: 100 });

    vi.spyOn(scroll.content, 'getBounds').mockReturnValue(new Rectangle(0, 0, 500, 500));

    scroll.scrollBy(10, 20);
    scroll.scrollBy(5, 5);

    expect(scroll.scrollX).toBe(15);
    expect(scroll.scrollY).toBe(25);
  });

  test('re-clamps existing scroll position when resized via setSize()', () => {
    const scroll = new ScrollContainer({ width: 100, height: 100 });

    vi.spyOn(scroll.content, 'getBounds').mockReturnValue(new Rectangle(0, 0, 500, 500));
    scroll.scrollTo(400, 400);
    expect(scroll.scrollX).toBe(400);

    // Growing the viewport shrinks the max scroll range, forcing a re-clamp.
    scroll.setSize(450, 450);
    expect(scroll.scrollX).toBe(50); // 500 - 450
    expect(scroll.scrollY).toBe(50);
  });
});

describe('ScrollContainer mouse-wheel routing', () => {
  test('ignores wheel events when the pointer position is unavailable', () => {
    const { stage, onMouseWheel } = makeStage(null);
    const scroll = new ScrollContainer({ width: 100, height: 100 });

    stubBounds(scroll, new Rectangle(0, 0, 100, 100), new Rectangle(0, 0, 500, 500));
    scroll._setStage(stage);

    onMouseWheel.dispatch(new Vector(0, 50));

    expect(scroll.scrollY).toBe(0);
  });

  test('ignores wheel events when the pointer is outside the widget bounds', () => {
    const { stage, onMouseWheel } = makeStage({ x: 500, y: 500 });
    const scroll = new ScrollContainer({ width: 100, height: 100 });

    stubBounds(scroll, new Rectangle(0, 0, 100, 100), new Rectangle(0, 0, 500, 500));
    scroll._setStage(stage);

    onMouseWheel.dispatch(new Vector(0, 50));

    expect(scroll.scrollY).toBe(0);
  });

  test('vertical (default) direction scrolls only on the Y delta', () => {
    const { stage, onMouseWheel } = makeStage({ x: 50, y: 50 });
    const scroll = new ScrollContainer({ width: 100, height: 100 });

    stubBounds(scroll, new Rectangle(0, 0, 100, 100), new Rectangle(0, 0, 500, 500));
    scroll._setStage(stage);

    onMouseWheel.dispatch(new Vector(30, 20));

    expect(scroll.scrollX).toBe(0);
    expect(scroll.scrollY).toBe(20);
  });

  test('horizontal direction scrolls only on the X delta', () => {
    const { stage, onMouseWheel } = makeStage({ x: 50, y: 50 });
    const scroll = new ScrollContainer({ width: 100, height: 100, direction: 'horizontal' });

    stubBounds(scroll, new Rectangle(0, 0, 100, 100), new Rectangle(0, 0, 500, 500));
    scroll._setStage(stage);

    onMouseWheel.dispatch(new Vector(30, 20));

    expect(scroll.scrollX).toBe(30);
    expect(scroll.scrollY).toBe(0);
  });

  test('"both" direction scrolls on both axes', () => {
    const { stage, onMouseWheel } = makeStage({ x: 50, y: 50 });
    const scroll = new ScrollContainer({ width: 100, height: 100, direction: 'both' });

    stubBounds(scroll, new Rectangle(0, 0, 100, 100), new Rectangle(0, 0, 500, 500));
    scroll._setStage(stage);

    onMouseWheel.dispatch(new Vector(30, 20));

    expect(scroll.scrollX).toBe(30);
    expect(scroll.scrollY).toBe(20);
  });
});

describe('ScrollContainer stage attach/detach', () => {
  test('_setStage(stage) subscribes to the new app onMouseWheel signal', () => {
    const { stage, onMouseWheel } = makeStage({ x: 50, y: 50 });
    const scroll = new ScrollContainer({ width: 100, height: 100 });

    expect(onMouseWheel.count).toBe(0);
    scroll._setStage(stage);
    expect(onMouseWheel.count).toBe(1);
  });

  test('re-setting the same app is a no-op (does not double-subscribe)', () => {
    const { stage, onMouseWheel } = makeStage({ x: 50, y: 50 });
    const scroll = new ScrollContainer({ width: 100, height: 100 });

    scroll._setStage(stage);
    scroll._setStage(stage);

    expect(onMouseWheel.count).toBe(1);
  });

  test('switching to a different stage unsubscribes from the old app and subscribes to the new one', () => {
    const first = makeStage({ x: 50, y: 50 });
    const second = makeStage({ x: 50, y: 50 });
    const scroll = new ScrollContainer({ width: 100, height: 100 });

    scroll._setStage(first.stage);
    expect(first.onMouseWheel.count).toBe(1);

    scroll._setStage(second.stage);
    expect(first.onMouseWheel.count).toBe(0);
    expect(second.onMouseWheel.count).toBe(1);
  });

  test('_setStage(null) unsubscribes from the current app', () => {
    const { stage, onMouseWheel } = makeStage({ x: 50, y: 50 });
    const scroll = new ScrollContainer({ width: 100, height: 100 });

    scroll._setStage(stage);
    expect(onMouseWheel.count).toBe(1);

    scroll._setStage(null);
    expect(onMouseWheel.count).toBe(0);
  });
});

describe('ScrollContainer.destroy()', () => {
  test('removes the wheel subscription from the attached app', () => {
    const { stage, onMouseWheel } = makeStage({ x: 50, y: 50 });
    const scroll = new ScrollContainer({ width: 100, height: 100 });

    scroll._setStage(stage);
    expect(onMouseWheel.count).toBe(1);

    scroll.destroy();
    expect(onMouseWheel.count).toBe(0);
  });

  test('is safe to call when never attached to a stage', () => {
    const scroll = new ScrollContainer({ width: 100, height: 100 });

    expect(() => scroll.destroy()).not.toThrow();
  });
});
