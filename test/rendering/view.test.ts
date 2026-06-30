import { Rectangle } from '#math/Rectangle';
import { View } from '#rendering/View';

describe('View', () => {
  test('follow updates center toward target', () => {
    const view = new View(0, 0, 100, 100);
    const target = { x: 80, y: 40 };

    view.follow(target);
    view.update(16);

    expect(view.center.x).toBe(80);
    expect(view.center.y).toBe(40);

    view.setCenter(0, 0);
    view.follow(target, { lerp: 0.5 });
    view.update(16);

    expect(view.center.x).toBeCloseTo(40);
    expect(view.center.y).toBeCloseTo(20);
  });

  test('bounds clamp keeps center within world limits', () => {
    const view = new View(0, 0, 100, 100);

    view.setBounds(new Rectangle(0, 0, 200, 200));
    view.setCenter(300, 300);
    view.update(16);

    expect(view.center.x).toBe(150);
    expect(view.center.y).toBe(150);
  });

  test('shake offsets while active and resets when finished', () => {
    const view = new View(0, 0, 100, 100);
    const baseline = view.getBounds().clone();

    view.shake(8, 100, { frequency: 12 });
    view.update(16);

    const shaken = view.getBounds().clone();
    expect(shaken.left !== baseline.left || shaken.top !== baseline.top).toBe(true);

    view.update(200);

    const settled = view.getBounds();
    expect(settled.left).toBeCloseTo(baseline.left);
    expect(settled.top).toBeCloseTo(baseline.top);
  });

  test('zoom helpers adjust size predictably', () => {
    const view = new View(0, 0, 200, 100);

    view.setZoom(2);
    expect(view.zoomLevel).toBe(2);
    expect(view.width).toBeCloseTo(100);
    expect(view.height).toBeCloseTo(50);

    view.zoomOut(0.5);
    expect(view.zoomLevel).toBeCloseTo(1.5);
    expect(view.width).toBeCloseTo(200 / 1.5);

    view.zoomIn(0.5);
    expect(view.zoomLevel).toBeCloseTo(2);
  });
});

describe('View.from', () => {
  test('applies center, size, viewport, rotation and zoom from options', () => {
    const view = View.from({
      center: { x: 50, y: 60 },
      size: { width: 800, height: 600 },
      viewport: new Rectangle(0.5, 0, 0.5, 1),
      rotation: 90,
      zoom: 2,
    });
    expect(view.center.x).toBe(50);
    expect(view.center.y).toBe(60);
    expect(view.viewport.equals(new Rectangle(0.5, 0, 0.5, 1))).toBe(true);
    expect(view.rotation).toBe(90);
    expect(view.zoomLevel).toBe(2);
    expect(view.width).toBe(400); // zoom 2 halves the visible area
    view.destroy();
  });

  test('defaults match a bare View (center 0,0 size 0,0 full viewport)', () => {
    const view = View.from({});
    expect(view.center.x).toBe(0);
    expect(view.width).toBe(0);
    expect(view.viewport.equals(new Rectangle(0, 0, 1, 1))).toBe(true);
    view.destroy();
  });
});

describe('View.setViewport', () => {
  test('setViewport sets a normalized viewport fluently and returns this', () => {
    const view = new View(0, 0, 100, 100);
    const ret = view.setViewport(0.5, 0, 0.5, 1);
    expect(ret).toBe(view);
    expect(view.viewport.equals(new Rectangle(0.5, 0, 0.5, 1))).toBe(true);
    view.destroy();
  });
});

describe('View — coordinate conversion', () => {
  // Centered camera over an 800×600 design space, matching the default camera.
  const centered = (): View => new View(400, 300, 800, 600);

  // The projection-matrix translation carries a constant sub-pixel artifact
  // (~2/width world units), so absolute mappings are asserted to 2 decimals.
  // Round-trips cancel the constant offset and stay accurate to 3.

  test('2-arg screenToWorld is the identity at the default centered camera', () => {
    const view = centered();

    for (const [x, y] of [
      [0, 0],
      [400, 300],
      [800, 600],
      [123, 456],
    ]) {
      const world = view.screenToWorld(x, y);

      expect(world.x).toBeCloseTo(x, 2);
      expect(world.y).toBeCloseTo(y, 2);
    }
  });

  test('2-arg screenToWorld/worldToScreen round-trip', () => {
    const view = new View(500, 400, 800, 600);

    view.setZoom(1.5);
    view.setRotation(20);

    const screen = view.worldToScreen(640, 360);
    const world = view.screenToWorld(screen.x, screen.y);

    expect(world.x).toBeCloseTo(640, 3);
    expect(world.y).toBeCloseTo(360, 3);
  });

  test('2-arg screenToWorld ignores the viewport rectangle', () => {
    const view = centered();
    const full = view.screenToWorld(200, 150);

    // A pillarbox viewport must not change design-space → world mapping.
    view.viewport = new Rectangle(0.25, 0, 0.5, 1);
    const boxed = view.screenToWorld(200, 150);

    expect(boxed.x).toBeCloseTo(full.x, 5);
    expect(boxed.y).toBeCloseTo(full.y, 5);
  });

  test('2-arg screenToWorld follows a panned camera', () => {
    const view = centered();

    view.setCenter(500, 400);

    // Screen center maps to the camera center; the top-left offsets with it.
    const center = view.screenToWorld(400, 300);
    const topLeft = view.screenToWorld(0, 0);

    expect(center.x).toBeCloseTo(500, 2);
    expect(center.y).toBeCloseTo(400, 2);
    expect(topLeft.x).toBeCloseTo(100, 2);
    expect(topLeft.y).toBeCloseTo(100, 2);
  });

  test('4-arg screenToWorld maps backing-store pixels at any pixelRatio', () => {
    const view = centered();

    // pixelRatio 1: canvas 800×600.
    const lowDpr = view.screenToWorld(400, 300, 800, 600);

    expect(lowDpr.x).toBeCloseTo(400, 2);
    expect(lowDpr.y).toBeCloseTo(300, 2);

    // pixelRatio 2: canvas 1600×1200 backing store, same design center.
    const highDpr = view.screenToWorld(800, 600, 1600, 1200);

    expect(highDpr.x).toBeCloseTo(400, 2);
    expect(highDpr.y).toBeCloseTo(300, 2);
  });
});
