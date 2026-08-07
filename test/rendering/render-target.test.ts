import { RenderTarget } from '#rendering/RenderTarget';
import { View } from '#rendering/View';

describe('RenderTarget view ownership', () => {
  test('setView does not destroy the view it replaces', () => {
    const target = new RenderTarget(320, 200);
    const first = new View(0, 0, 320, 200);
    const second = new View(0, 0, 320, 200);

    target.setView(first);
    target.setView(second);

    expect(first.destroyed).toBe(false);
    expect(target.view).toBe(second);

    first.destroy();
    second.destroy();
    target.destroy();
  });

  test('destroy releases the default view but leaves an assigned view alive', () => {
    const target = new RenderTarget(320, 200);
    const custom = new View(0, 0, 320, 200);

    target.setView(custom);
    target.destroy();

    // The backend assigns the application's active camera to its root target on
    // every setView, so destroying the target must not take that camera with it.
    expect(custom.destroyed).toBe(false);

    custom.setCenter(40, 60);

    expect(custom.getBounds().left).toBe(-120);

    custom.destroy();
  });

  test('destroy is idempotent and fires destroy listeners exactly once', () => {
    const target = new RenderTarget(320, 200);
    const listener = vi.fn();

    target.addDestroyListener(listener);
    target.destroy();
    target.destroy();

    expect(target.destroyed).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
