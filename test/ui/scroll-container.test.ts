/**
 * ScrollContainer tests - construction defaults, scroll clamping, mouse-wheel
 * routing (direction filtering + in-bounds gating), stage attach/detach
 * subscription lifecycle, and destroy() cleanup.
 */

import type { Application } from '#core/Application';
import { Signal } from '#core/Signal';
import type { Stage } from '#core/Stage';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { ScrollContainer } from '#ui/ScrollContainer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal Stage whose `app.input` carries a real onMouseWheel Signal and
 * whose `app.interaction` answers with whatever node the test declares hovered -
 * the same answer the real hit-test path produces for a pointer position.
 */
const makeStage = (): {
  stage: Stage;
  onMouseWheel: Signal<[deltaX: number, deltaY: number]>;
  setHovered: (node: RenderNode | null) => void;
} => {
  const onMouseWheel = new Signal<[deltaX: number, deltaY: number]>();
  let hovered: RenderNode | null = null;
  const app = {
    input: { onMouseWheel },
    interaction: { getHoveredNode: vi.fn(() => hovered) },
  } as unknown as Application;

  // Full no-op hook implementations - Container._setStage() propagates the
  // stage to `content` too, and later setPosition() calls (via scrollTo())
  // walk up through these hooks to invalidate bounds.
  const interaction: Stage['interaction'] = {
    _notifyNodeAdded: vi.fn(),
    _notifyNodeRemoved: vi.fn(),
    _notifyInteractiveChanged: vi.fn(),
    _notifyBoundsInvalidated: vi.fn(),
    _notifyTransformGroupMoved: vi.fn(),
  };
  const focus: Stage['focus'] = {
    focused: null,
    focus: vi.fn(),
    blur: vi.fn(),
    _notifyNodeRemoved: vi.fn(),
  };

  return {
    stage: { interaction, focus, app },
    onMouseWheel,
    setHovered: (node: RenderNode | null): void => void (hovered = node),
  };
};

/**
 * Stub `content`'s bounds for deterministic wheel-routing tests. The widget's
 * OWN bounds are deliberately left real (not stubbed) - they now derive from
 * `uiWidth`/`uiHeight`, and a wheel-routing test that stubs them
 * back to an arbitrary rect would mask exactly the viewport-vs-content bug
 * these tests guard against.
 */
const stubContentBounds = (scroll: ScrollContainer, contentBounds: Rectangle): void => {
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

  test('accepts an explicit direction option and exposes it', () => {
    expect(new ScrollContainer({ width: 100, height: 100 }).direction).toBe('vertical');
    expect(new ScrollContainer({ width: 100, height: 100, direction: 'horizontal' }).direction).toBe('horizontal');
    expect(new ScrollContainer({ width: 100, height: 100, direction: 'both' }).direction).toBe('both');
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
  test('ignores wheel events while nothing is hovered', () => {
    const { stage, onMouseWheel } = makeStage();
    const scroll = new ScrollContainer({ width: 100, height: 100 });

    stubContentBounds(scroll, new Rectangle(0, 0, 500, 500));
    scroll._setStage(stage);

    onMouseWheel.dispatch(0, 50);

    expect(scroll.scrollY).toBe(0);
  });

  test('ignores wheel events while the hit lands outside this container', () => {
    const { stage, onMouseWheel, setHovered } = makeStage();
    const scroll = new ScrollContainer({ width: 100, height: 100 });
    const elsewhere = new Container();

    stubContentBounds(scroll, new Rectangle(0, 0, 500, 500));
    scroll._setStage(stage);
    setHovered(elsewhere);

    onMouseWheel.dispatch(0, 50);

    expect(scroll.scrollY).toBe(0);
  });

  test('takes the wheel for a hit on a descendant of its content', () => {
    const { stage, onMouseWheel, setHovered } = makeStage();
    const scroll = new ScrollContainer({ width: 100, height: 100 });
    const item = new Container();

    scroll.content.addChild(item);
    stubContentBounds(scroll, new Rectangle(0, 0, 500, 500));
    scroll._setStage(stage);
    setHovered(item);

    onMouseWheel.dispatch(0, 50);

    expect(scroll.scrollY).toBe(50);
  });

  test('vertical (default) direction scrolls only on the Y delta', () => {
    const { stage, onMouseWheel, setHovered } = makeStage();
    const scroll = new ScrollContainer({ width: 100, height: 100 });

    stubContentBounds(scroll, new Rectangle(0, 0, 500, 500));
    scroll._setStage(stage);
    setHovered(scroll);

    onMouseWheel.dispatch(30, 20);

    expect(scroll.scrollX).toBe(0);
    expect(scroll.scrollY).toBe(20);
  });

  test('horizontal direction scrolls only on the X delta', () => {
    const { stage, onMouseWheel, setHovered } = makeStage();
    const scroll = new ScrollContainer({ width: 100, height: 100, direction: 'horizontal' });

    stubContentBounds(scroll, new Rectangle(0, 0, 500, 500));
    scroll._setStage(stage);
    setHovered(scroll);

    onMouseWheel.dispatch(30, 20);

    expect(scroll.scrollX).toBe(30);
    expect(scroll.scrollY).toBe(0);
  });

  test('"both" direction scrolls on both axes', () => {
    const { stage, onMouseWheel, setHovered } = makeStage();
    const scroll = new ScrollContainer({ width: 100, height: 100, direction: 'both' });

    stubContentBounds(scroll, new Rectangle(0, 0, 500, 500));
    scroll._setStage(stage);
    setHovered(scroll);

    onMouseWheel.dispatch(30, 20);

    expect(scroll.scrollX).toBe(30);
    expect(scroll.scrollY).toBe(20);
  });

  test('only the container the hit resolves into scrolls when two overlap', () => {
    const { stage, onMouseWheel, setHovered } = makeStage();
    const behind = new ScrollContainer({ width: 100, height: 100 });
    const front = new ScrollContainer({ width: 100, height: 100 });

    stubContentBounds(behind, new Rectangle(0, 0, 500, 500));
    stubContentBounds(front, new Rectangle(0, 0, 500, 500));
    behind._setStage(stage);
    front._setStage(stage);

    // Both occupy the same box; the hit-test path resolved the wheel to the one
    // painted on top, and the one underneath must not scroll with it.
    setHovered(front);

    onMouseWheel.dispatch(0, 50);

    expect(front.scrollY).toBe(50);
    expect(behind.scrollY).toBe(0);
  });

  test('a nested container takes the wheel from the one around it', () => {
    const { stage, onMouseWheel, setHovered } = makeStage();
    const outer = new ScrollContainer({ width: 200, height: 200 });
    const inner = new ScrollContainer({ width: 100, height: 100 });
    const item = new Container();

    inner.content.addChild(item);
    outer.content.addChild(inner);
    stubContentBounds(outer, new Rectangle(0, 0, 500, 500));
    stubContentBounds(inner, new Rectangle(0, 0, 500, 500));
    outer._setStage(stage);
    setHovered(item);

    onMouseWheel.dispatch(0, 50);

    expect(inner.scrollY).toBe(50);
    expect(outer.scrollY).toBe(0);
  });
});

describe('ScrollContainer viewport bounds (ME-58)', () => {
  test('getBounds() reflects the declared viewport, not the (possibly much larger) content extent', () => {
    const scroll = new ScrollContainer({ width: 100, height: 100 });

    stubContentBounds(scroll, new Rectangle(0, 0, 5000, 5000));

    const bounds = scroll.getBounds();

    expect(bounds.width).toBe(100);
    expect(bounds.height).toBe(100);
  });

  test('getBounds() tracks setSize() — a resized viewport is reflected without a stale cache', () => {
    const scroll = new ScrollContainer({ width: 100, height: 100 });

    expect(scroll.getBounds().width).toBe(100);

    scroll.setSize(250, 180);

    expect(scroll.getBounds().width).toBe(250);
    expect(scroll.getBounds().height).toBe(180);
  });

  test('contains() rejects a point outside the viewport even when a scrolled child would otherwise claim it', () => {
    const scroll = new ScrollContainer({ width: 100, height: 100 });
    const child = new Container();

    scroll.content.addChild(child);
    // Simulate a child whose own geometry claims every point - isolates the
    // viewport gate under test from needing real drawn geometry.
    vi.spyOn(child, 'contains').mockReturnValue(true);

    // Outside the 100x100 viewport - must be rejected regardless of the child.
    expect(scroll.contains(500, 500)).toBe(false);
    // Inside the viewport, with a child that claims the point - accepted.
    expect(scroll.contains(50, 50)).toBe(true);
  });

  test('contains() still requires an actual child hit inside the viewport (delegation semantics unchanged)', () => {
    const scroll = new ScrollContainer({ width: 100, height: 100 });

    // No children at all - nothing to hit, even squarely inside the viewport.
    expect(scroll.contains(50, 50)).toBe(false);
  });
});

describe('ScrollContainer stage attach/detach', () => {
  test('_setStage(stage) subscribes to the new app onMouseWheel signal', () => {
    const { stage, onMouseWheel } = makeStage();
    const scroll = new ScrollContainer({ width: 100, height: 100 });

    expect(onMouseWheel.count).toBe(0);
    scroll._setStage(stage);
    expect(onMouseWheel.count).toBe(1);
  });

  test('re-setting the same app is a no-op (does not double-subscribe)', () => {
    const { stage, onMouseWheel } = makeStage();
    const scroll = new ScrollContainer({ width: 100, height: 100 });

    scroll._setStage(stage);
    scroll._setStage(stage);

    expect(onMouseWheel.count).toBe(1);
  });

  test('switching to a different stage unsubscribes from the old app and subscribes to the new one', () => {
    const first = makeStage();
    const second = makeStage();
    const scroll = new ScrollContainer({ width: 100, height: 100 });

    scroll._setStage(first.stage);
    expect(first.onMouseWheel.count).toBe(1);

    scroll._setStage(second.stage);
    expect(first.onMouseWheel.count).toBe(0);
    expect(second.onMouseWheel.count).toBe(1);
  });

  test('_setStage(null) unsubscribes from the current app', () => {
    const { stage, onMouseWheel } = makeStage();
    const scroll = new ScrollContainer({ width: 100, height: 100 });

    scroll._setStage(stage);
    expect(onMouseWheel.count).toBe(1);

    scroll._setStage(null);
    expect(onMouseWheel.count).toBe(0);
  });
});

describe('ScrollContainer.destroy()', () => {
  test('removes the wheel subscription from the attached app', () => {
    const { stage, onMouseWheel } = makeStage();
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
