import type { MockInstance } from 'vitest';

/**
 * UIRoot tests - the internal `_render()` resize-detection hook and
 * `destroy()` cleanup. `Scene.ui` integration (hit-testing, lazy creation)
 * is covered separately in `test/ui/scene-ui.test.ts`.
 */
import type { RenderingContext } from '#rendering/RenderingContext';
import { Panel } from '#ui/Panel';
import { UIRoot } from '#ui/UIRoot';

const makeContext = (width: number, height: number): { screenView: { width: number; height: number }; render: MockInstance } => ({
  screenView: { width, height },
  render: vi.fn(),
});

describe('UIRoot._render', () => {
  test('dispatches onResize and updates screenWidth/screenHeight on the first call', () => {
    const root = new UIRoot();
    const context = makeContext(800, 600);
    const handler = vi.fn();

    root.onResize.add(handler);
    root._render(context as unknown as RenderingContext);

    expect(handler).toHaveBeenCalledWith(800, 600);
    expect(root.screenWidth).toBe(800);
    expect(root.screenHeight).toBe(600);
    expect(context.render).toHaveBeenCalledWith(root, { view: context.screenView });
  });

  test('does not re-dispatch onResize when the screen size is unchanged', () => {
    const root = new UIRoot();
    const context = makeContext(800, 600);

    root._render(context as unknown as RenderingContext);

    const handler = vi.fn();

    root.onResize.add(handler);
    root._render(context as unknown as RenderingContext);

    expect(handler).not.toHaveBeenCalled();
  });

  test('re-dispatches onResize when the screen size changes between calls', () => {
    const root = new UIRoot();
    const context1 = makeContext(800, 600);
    const context2 = makeContext(1024, 768);
    const handler = vi.fn();

    root.onResize.add(handler);
    root._render(context1 as unknown as RenderingContext);
    root._render(context2 as unknown as RenderingContext);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenLastCalledWith(1024, 768);
  });

  test('screenWidth/screenHeight default to 0 before the first render', () => {
    const root = new UIRoot();

    expect(root.screenWidth).toBe(0);
    expect(root.screenHeight).toBe(0);
  });
});

describe('UIRoot.uiScale', () => {
  test('defaults to 1 and leaves the laid-out box equal to the view', () => {
    const root = new UIRoot();

    root._render(makeContext(800, 600) as unknown as RenderingContext);

    expect(root.uiScale).toBe(1);
    expect(root.screenWidth).toBe(800);
    expect(root.screenHeight).toBe(600);
  });

  test('scales the layer transform and shrinks the box widgets lay out in', () => {
    const root = new UIRoot();
    const handler = vi.fn();

    root._render(makeContext(800, 600) as unknown as RenderingContext);
    root.onResize.add(handler);
    root.uiScale = 2;

    expect(root.scale.x).toBe(2);
    expect(root.scale.y).toBe(2);
    expect(root.screenWidth).toBe(400);
    expect(root.screenHeight).toBe(300);
    expect(handler).toHaveBeenCalledWith(400, 300);
  });

  test('keeps reporting the scaled box across a later resize', () => {
    const root = new UIRoot();

    root.uiScale = 2;
    root._render(makeContext(800, 600) as unknown as RenderingContext);

    expect(root.screenWidth).toBe(400);

    root._render(makeContext(1600, 1200) as unknown as RenderingContext);

    expect(root.screenWidth).toBe(800);
  });

  test('re-anchors a widget against the scaled box', () => {
    const root = new UIRoot();
    const widget = new Panel({ width: 100, height: 50 });

    root.addChild(widget);
    root._render(makeContext(800, 600) as unknown as RenderingContext);
    widget.anchorIn(root, 'bottom-right');

    expect(widget.position.x).toBe(700);

    root.uiScale = 2;

    expect(widget.position.x).toBe(300);
  });

  test('uiScaleStep snaps the factor, and re-snaps the one already set', () => {
    const root = new UIRoot();

    root.uiScaleStep = 0.25;
    root.uiScale = 1.3;

    expect(root.uiScale).toBe(1.25);

    root.uiScale = 1.4;

    expect(root.uiScale).toBe(1.5);

    root.uiScaleStep = 1;

    expect(root.uiScale).toBe(2);
  });

  test('never collapses the layer to a zero or negative factor', () => {
    const root = new UIRoot();

    root.uiScale = 0;

    expect(root.uiScale).toBeGreaterThan(0);

    root.uiScale = -4;

    expect(root.uiScale).toBeGreaterThan(0);
  });

  test('scaleForTouchTarget reports the factor a physical target needs', () => {
    // 96 CSS pixels per inch: a 24-pixel control is ~6.35mm, so reaching 9mm
    // needs roughly 1.4x.
    expect(UIRoot.scaleForTouchTarget(24, 9)).toBeCloseTo(1.417, 2);
    // A control that is already large enough is never shrunk.
    expect(UIRoot.scaleForTouchTarget(96, 9)).toBe(1);
    expect(UIRoot.scaleForTouchTarget(0, 9)).toBe(1);
  });
});

describe('UIRoot.destroy()', () => {
  test('destroys the onResize signal and the underlying container', () => {
    const root = new UIRoot();

    expect(() => root.destroy()).not.toThrow();
  });
});
