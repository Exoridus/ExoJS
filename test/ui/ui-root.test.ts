/**
 * UIRoot tests — the internal `_render()` resize-detection hook and
 * `destroy()` cleanup. `Scene.ui` integration (hit-testing, lazy creation)
 * is covered separately in `test/ui/scene-ui.test.ts`.
 */

import type { RenderingContext } from '#rendering/RenderingContext';
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

describe('UIRoot.destroy()', () => {
  test('destroys the onResize signal and the underlying container', () => {
    const root = new UIRoot();

    expect(() => root.destroy()).not.toThrow();
  });
});
