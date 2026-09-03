/**
 * Scrollbar tests - thumb geometry against the declared range, drag-to-scroll
 * through the application's pointer signals, and the ScrollContainer wiring:
 * visibility policy, both axes, and the optional background surface.
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Signal } from '#core/Signal';
import type { Stage } from '#core/Stage';
import type { InteractionEvent } from '#input/InteractionEvent';
import type { Pointer } from '#input/Pointer';
import { Rectangle } from '#math/Rectangle';
import { Graphics } from '#rendering/primitives/Graphics';
import { Scrollbar } from '#ui/Scrollbar';
import { ScrollContainer } from '#ui/ScrollContainer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PointerSignals {
  onPointerMove: Signal<[pointer: Pointer, x: number, y: number]>;
  onPointerUp: Signal<[pointer: Pointer, x: number, y: number]>;
  onPointerCancel: Signal<[pointer: Pointer, x: number, y: number]>;
}

/** A minimal Stage whose `app.input` carries the signals a drag subscribes to. */
const makeStage = (): { stage: Stage } & PointerSignals => {
  const signals: PointerSignals = {
    onPointerMove: new Signal(),
    onPointerUp: new Signal(),
    onPointerCancel: new Signal(),
  };
  const app = {
    input: {
      ...signals,
      onMouseWheel: new Signal<[deltaX: number, deltaY: number]>(),
      getPrimaryPointerPosition: vi.fn(() => null),
    },
  } as unknown as Application;

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

  return { stage: { interaction, focus, app }, ...signals };
};

const pointerDownAt = (x: number, y: number, id = 1): InteractionEvent => ({ x, y, pointer: { id }, stopPropagation: vi.fn() }) as unknown as InteractionEvent;

const fakePointer = { id: 1 } as Pointer;

/** A second contact, for the multi-touch cases. */
const otherPointer = { id: 2 } as Pointer;

/** Stub `content`'s bounds so the scroll range is deterministic without a renderer. */
const stubContentBounds = (scroll: ScrollContainer, width: number, height: number): void => {
  vi.spyOn(scroll.content, 'getBounds').mockReturnValue(new Rectangle(0, 0, width, height));
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Scrollbar geometry', () => {
  test('hides the thumb while the content fits', () => {
    const bar = new Scrollbar().setLength(200);

    bar.setRange(200, 150);

    expect(bar.overflowing).toBe(false);
    expect(bar.thumbNode.visible).toBe(false);
  });

  test('sizes the thumb to the visible fraction and places it by the offset', () => {
    const bar = new Scrollbar().setLength(200);

    bar.setRange(100, 400);

    expect(bar.maxOffset).toBe(300);
    expect(bar.thumbNode.visible).toBe(true);
    expect(bar.thumbNode.uiHeight).toBe(50);
    expect(bar.thumbNode.position.y).toBe(0);

    bar.offset = 300;

    expect(bar.thumbNode.position.y).toBe(150);
  });

  test('keeps the thumb grabbable at minThumbLength for a very long content', () => {
    const bar = new Scrollbar({ minThumbLength: 30 }).setLength(200);

    bar.setRange(100, 100_000);

    expect(bar.thumbNode.uiHeight).toBe(30);
  });

  test('clamps the offset to the range, and re-clamps when the range shrinks', () => {
    const bar = new Scrollbar().setLength(200);

    bar.setRange(100, 400);
    bar.offset = 5000;

    expect(bar.offset).toBe(300);

    bar.setRange(100, 200);

    expect(bar.offset).toBe(100);
  });

  test('a horizontal bar runs along x and takes its thickness on y', () => {
    const bar = new Scrollbar({ orientation: 'horizontal', thickness: 10 }).setLength(300);

    bar.setRange(150, 600);

    expect(bar.uiWidth).toBe(300);
    expect(bar.uiHeight).toBe(10);
    expect(bar.thumbNode.uiWidth).toBe(75);
    expect(bar.thumbNode.uiHeight).toBe(10);
  });
});

describe('Scrollbar drag', () => {
  test('a thumb drag reports the offset it travelled to', () => {
    const { stage, onPointerMove, onPointerUp } = makeStage();
    const bar = new Scrollbar().setLength(200);
    const seen: number[] = [];

    bar._setStage(stage);
    bar.setRange(100, 400);
    bar.onScroll.add(offset => seen.push(offset));

    bar.thumbNode.onPointerDown.dispatch(pointerDownAt(0, 10));

    expect(bar.dragging).toBe(true);

    // Travel is 200 - 50 = 150 pixels for a 300-pixel range: half the travel
    // is half the range.
    onPointerMove.dispatch(fakePointer, 0, 85);

    expect(bar.offset).toBe(150);
    expect(seen).toEqual([150]);

    onPointerUp.dispatch(fakePointer, 0, 85);

    expect(bar.dragging).toBe(false);

    onPointerMove.dispatch(fakePointer, 0, 200);

    expect(bar.offset).toBe(150);
  });

  test('a second contact neither drags the thumb nor ends the drag', () => {
    const { stage, onPointerMove, onPointerUp } = makeStage();
    const bar = new Scrollbar().setLength(200);

    bar._setStage(stage);
    bar.setRange(100, 400);
    bar.thumbNode.onPointerDown.dispatch(pointerDownAt(0, 10));

    onPointerMove.dispatch(otherPointer, 0, 85);

    expect(bar.offset).toBe(0);

    onPointerUp.dispatch(otherPointer, 0, 85);

    expect(bar.dragging).toBe(true);

    onPointerMove.dispatch(fakePointer, 0, 85);

    expect(bar.offset).toBe(150);
  });

  test('a drag past the end clamps instead of overshooting', () => {
    const { stage, onPointerMove } = makeStage();
    const bar = new Scrollbar().setLength(200);

    bar._setStage(stage);
    bar.setRange(100, 400);
    bar.thumbNode.onPointerDown.dispatch(pointerDownAt(0, 0));
    onPointerMove.dispatch(fakePointer, 0, 10_000);

    expect(bar.offset).toBe(300);
  });

  test('does not start a drag while nothing overflows', () => {
    const { stage } = makeStage();
    const bar = new Scrollbar().setLength(200);

    bar._setStage(stage);
    bar.setRange(200, 200);
    bar.thumbNode.onPointerDown.dispatch(pointerDownAt(0, 0));

    expect(bar.dragging).toBe(false);
  });

  test('leaving the tree ends an in-flight drag', () => {
    const { stage, onPointerMove } = makeStage();
    const bar = new Scrollbar().setLength(200);

    bar._setStage(stage);
    bar.setRange(100, 400);
    bar.thumbNode.onPointerDown.dispatch(pointerDownAt(0, 0));
    bar._setStage(null);

    expect(bar.dragging).toBe(false);

    onPointerMove.dispatch(fakePointer, 0, 100);

    expect(bar.offset).toBe(0);
  });
});

describe('ScrollContainer scrollbars', () => {
  test("'auto' shows a bar only while its axis overflows", () => {
    const scroll = new ScrollContainer({ width: 100, height: 100 });

    stubContentBounds(scroll, 100, 100);
    scroll.refresh();

    expect(scroll.verticalScrollbar?.visible).toBe(false);

    stubContentBounds(scroll, 100, 400);
    scroll.refresh();

    expect(scroll.verticalScrollbar?.visible).toBe(true);
    expect(scroll.verticalScrollbar?.maxOffset).toBe(300);
  });

  test("'always' keeps the bar, 'never' builds none", () => {
    const always = new ScrollContainer({ width: 100, height: 100, scrollbars: 'always' });
    const never = new ScrollContainer({ width: 100, height: 100, scrollbars: 'never' });

    stubContentBounds(always, 100, 100);
    always.refresh();

    expect(always.verticalScrollbar?.visible).toBe(true);
    expect(never.verticalScrollbar).toBeNull();
  });

  test("'both' builds one bar per axis and places them along their edges", () => {
    const scroll = new ScrollContainer({ width: 200, height: 100, direction: 'both', scrollbarThickness: 10 });

    stubContentBounds(scroll, 800, 400);
    scroll.refresh();

    const vertical = scroll.verticalScrollbar;
    const horizontal = scroll.horizontalScrollbar;

    expect(vertical?.position.x).toBe(190);
    expect(horizontal?.position.y).toBe(90);
    // Each bar stops short of the other so the corner is not claimed twice.
    expect(vertical?.length).toBe(90);
    expect(horizontal?.length).toBe(190);
  });

  test('a vertical-only container has no horizontal bar', () => {
    const scroll = new ScrollContainer({ width: 100, height: 100 });

    expect(scroll.horizontalScrollbar).toBeNull();
  });

  test('scrolling moves the bar, and dragging the bar scrolls the content', () => {
    const scroll = new ScrollContainer({ width: 100, height: 100 });

    stubContentBounds(scroll, 100, 300);
    scroll.scrollTo(0, 50);

    expect(scroll.verticalScrollbar?.offset).toBe(50);

    scroll.verticalScrollbar?.onScroll.dispatch(120, scroll.verticalScrollbar);

    expect(scroll.scrollY).toBe(120);
  });

  test('adding content updates the range without an explicit refresh', () => {
    const scroll = new ScrollContainer({ width: 100, height: 100 });
    const item = new Graphics();

    stubContentBounds(scroll, 100, 500);
    scroll.content.addChild(item);

    expect(scroll.verticalScrollbar?.contentLength).toBe(500);
  });
});

describe('ScrollContainer background', () => {
  test('paints nothing by default', () => {
    const scroll = new ScrollContainer({ width: 100, height: 100 });

    expect(scroll.background).toBeNull();
    expect(scroll.backgroundNode).toBeNull();
  });

  test('a colour becomes a fill surface behind the content', () => {
    const scroll = new ScrollContainer({ width: 100, height: 100, background: new Color(10, 20, 30, 1) });

    expect(scroll.background?.kind).toBe('fill');
    expect(scroll.backgroundNode).toBeInstanceOf(Graphics);
    expect(scroll.children.indexOf(scroll.backgroundNode!)).toBeLessThan(scroll.children.indexOf(scroll.content));
  });

  test('setBackground(null) returns the container to transparent', () => {
    const scroll = new ScrollContainer({ width: 100, height: 100, background: new Color(10, 20, 30, 1) });

    scroll.setBackground(null);

    expect(scroll.background).toBeNull();
    expect(scroll.backgroundNode).toBeNull();
  });
});
