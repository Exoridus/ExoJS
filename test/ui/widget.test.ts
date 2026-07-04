/**
 * Widget base-class tests — anchoring math, setSize/anchor interplay, and
 * destroy() cleanup. Exercised through a minimal concrete subclass since
 * Widget itself is abstract.
 */

import { UIRoot } from '#ui/UIRoot';
import { Widget } from '#ui/Widget';

class TestWidget extends Widget {}

describe('Widget anchoring math', () => {
  test('"top-left" anchor resolves to (0, 0) factors', () => {
    const root = new UIRoot();
    const widget = new TestWidget();

    widget.setSize(20, 10);
    widget.anchorIn(root, 'top-left');
    root.onResize.dispatch(400, 300);

    expect(widget.position.x).toBe(0);
    expect(widget.position.y).toBe(0);
  });

  test('"top" anchor centers horizontally and pins to the top edge', () => {
    const root = new UIRoot();
    const widget = new TestWidget();

    widget.setSize(20, 10);
    widget.anchorIn(root, 'top');
    root.onResize.dispatch(400, 300);

    expect(widget.position.x).toBe((400 - 20) / 2);
    expect(widget.position.y).toBe(0);
  });

  test('"left" anchor pins to the left edge and centers vertically', () => {
    const root = new UIRoot();
    const widget = new TestWidget();

    widget.setSize(20, 10);
    widget.anchorIn(root, 'left');
    root.onResize.dispatch(400, 300);

    expect(widget.position.x).toBe(0);
    expect(widget.position.y).toBe((300 - 10) / 2);
  });
});

describe('Widget.anchorIn re-invocation', () => {
  test('re-anchoring to the same root does not resubscribe to onResize', () => {
    const root = new UIRoot();
    const widget = new TestWidget();

    widget.setSize(10, 10);
    widget.anchorIn(root, 'top-left');
    expect(root.onResize.count).toBe(1);

    // Same root, different anchor position — must not add a second subscription.
    widget.anchorIn(root, 'bottom-right');
    expect(root.onResize.count).toBe(1);

    root.onResize.dispatch(200, 100);
    expect(widget.position.x).toBe(200 - 10);
    expect(widget.position.y).toBe(100 - 10);
  });
});

describe('Widget.setSize + anchoring interplay', () => {
  test('setSize() re-applies the anchor against the root current screen size', () => {
    const root = new UIRoot();
    const widget = new TestWidget();

    widget.anchorIn(root, 'bottom-right', -5, -5);
    // root.screenWidth/screenHeight default to 0 (never rendered through _render).
    widget.setSize(20, 20);

    expect(widget.position.x).toBe(0 - 20 - 5);
    expect(widget.position.y).toBe(0 - 20 - 5);
  });

  test('setSize() to the same dimensions is a no-op (no re-layout)', () => {
    const widget = new TestWidget();

    widget.setSize(30, 30);
    const before = { x: widget.position.x, y: widget.position.y };

    widget.setSize(30, 30);

    expect(widget.position).toMatchObject(before);
  });

  test('setSize() clamps negative dimensions to zero', () => {
    const widget = new TestWidget();

    widget.setSize(-10, -20);

    expect(widget.uiWidth).toBe(0);
    expect(widget.uiHeight).toBe(0);
  });
});

describe('Widget._applyAnchor guard', () => {
  test('is a no-op before anchorIn has ever been called', () => {
    const widget = new TestWidget();
    const applyAnchor = (widget as unknown as { _applyAnchor: (w: number, h: number) => void })._applyAnchor.bind(widget);

    expect(() => applyAnchor(100, 100)).not.toThrow();
    expect(widget.position.x).toBe(0);
    expect(widget.position.y).toBe(0);
  });
});

describe('Widget.destroy()', () => {
  test('unsubscribes from the anchor root resize signal', () => {
    const root = new UIRoot();
    const widget = new TestWidget();

    widget.anchorIn(root, 'center');
    expect(root.onResize.count).toBe(1);

    widget.destroy();
    expect(root.onResize.count).toBe(0);
  });

  test('is safe to call when the widget was never anchored', () => {
    const widget = new TestWidget();

    expect(() => widget.destroy()).not.toThrow();
  });
});

describe('Widget.enabled', () => {
  test('the default _onEnabledChanged hook is a no-op for widgets that do not override it', () => {
    const widget = new TestWidget();

    expect(() => {
      widget.enabled = false;
    }).not.toThrow();
    expect(widget.enabled).toBe(false);
  });

  test('setting the same value twice does not re-trigger the change hook', () => {
    const widget = new TestWidget();
    let calls = 0;

    (widget as unknown as { _onEnabledChanged: (e: boolean) => void })._onEnabledChanged = (): void => {
      calls++;
    };

    widget.enabled = true; // already true — no-op
    expect(calls).toBe(0);

    widget.enabled = false;
    expect(calls).toBe(1);
  });
});
