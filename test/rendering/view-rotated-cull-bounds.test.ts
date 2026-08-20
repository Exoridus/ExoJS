import { View } from '#rendering/View';

/**
 * The world-space AABB of the four viewport corners, mapped through the view's
 * own `screenToWorld`. This is by definition the area the camera renders, so
 * the cull bounds must cover exactly it - whatever rotation, zoom or centre is
 * in play, and independent of how the projection composes them.
 */
const visibleAreaFromCorners = (view: View): { left: number; top: number; right: number; bottom: number } => {
  const corners = [
    view.screenToWorld(0, 0),
    view.screenToWorld(view.width, 0),
    view.screenToWorld(view.width, view.height),
    view.screenToWorld(0, view.height),
  ];
  const xs = corners.map(corner => corner.x);
  const ys = corners.map(corner => corner.y);

  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
};

const expectBoundsCoverVisibleArea = (view: View): void => {
  const bounds = view.getBounds();
  const visible = visibleAreaFromCorners(view);

  expect(bounds.left).toBeCloseTo(visible.left, 6);
  expect(bounds.top).toBeCloseTo(visible.top, 6);
  expect(bounds.right).toBeCloseTo(visible.right, 6);
  expect(bounds.bottom).toBeCloseTo(visible.bottom, 6);
};

describe('View cull bounds account for rotation', () => {
  test('an unrotated view spans exactly its size', () => {
    const view = new View(0, 0, 800, 600);

    expectBoundsCoverVisibleArea(view);
    expect(view.getBounds().width).toBeCloseTo(800, 3);
    expect(view.getBounds().height).toBeCloseTo(600, 3);

    view.destroy();
  });

  test('a 45-degree view grows to cover its rotated corners', () => {
    const view = new View(0, 0, 800, 600);

    view.setRotation(45);

    // Centre +- half-size ignores rotation, so a rotated camera got a cull rect
    // strictly smaller than the area it renders and content popped in at the
    // rotated corners. The rotated AABB of a 800x600 box is ~989.9 square.
    const expected = (400 + 300) * Math.SQRT2;

    expect(view.getBounds().width).toBeCloseTo(expected, 2);
    expect(view.getBounds().height).toBeCloseTo(expected, 2);
    expectBoundsCoverVisibleArea(view);

    view.destroy();
  });

  test('a 90-degree view swaps its extents', () => {
    const view = new View(0, 0, 800, 600);

    view.setRotation(90);

    expect(view.getBounds().width).toBeCloseTo(600, 2);
    expect(view.getBounds().height).toBeCloseTo(800, 2);
    expectBoundsCoverVisibleArea(view);

    view.destroy();
  });

  test('a negative rotation covers the same area as its positive counterpart', () => {
    const positive = new View(0, 0, 800, 600);
    const negative = new View(0, 0, 800, 600);

    positive.setRotation(45);
    negative.setRotation(-45);

    expect(negative.getBounds().width).toBeCloseTo(positive.getBounds().width, 6);
    expect(negative.getBounds().height).toBeCloseTo(positive.getBounds().height, 6);

    positive.destroy();
    negative.destroy();
  });

  test.each([
    { angle: 0, centerX: 0, centerY: 0, zoom: 1 },
    { angle: 30, centerX: 120, centerY: -60, zoom: 1 },
    { angle: 45, centerX: 0, centerY: 0, zoom: 2 },
    { angle: 17, centerX: -400, centerY: 250, zoom: 0.5 },
    { angle: 200, centerX: 75, centerY: 75, zoom: 1.5 },
  ])('cull bounds cover the rendered area at $angle deg, centre ($centerX, $centerY), zoom $zoom', ({ angle, centerX, centerY, zoom }) => {
    const view = new View(centerX, centerY, 800, 600);

    view.setRotation(angle);
    view.setZoom(zoom);

    expectBoundsCoverVisibleArea(view);

    view.destroy();
  });

  test('a zero-sized view still reports a degenerate rect at its center', () => {
    const view = new View(50, 70, 0, 0);
    const bounds = view.getBounds();

    // The projection is degenerate here; the bounds must stay a real rectangle
    // rather than decaying into NaN.
    expect(bounds.x).toBe(50);
    expect(bounds.y).toBe(70);
    expect(bounds.width).toBe(0);
    expect(bounds.height).toBe(0);

    view.destroy();
  });
});
