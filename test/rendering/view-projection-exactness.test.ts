import { View } from '#rendering/View';

describe('View projection maps its own viewport exactly', () => {
  test('the camera center lands in the middle of the viewport', () => {
    const view = new View(120, -60, 800, 600);
    const screen = view.worldToScreen(120, -60);

    expect(screen.x).toBeCloseTo(400, 9);
    expect(screen.y).toBeCloseTo(300, 9);

    view.destroy();
  });

  test('the viewport corners map to the camera rectangle', () => {
    const view = new View(0, 0, 800, 600);

    // A stray `x * -a - y * b` term shifted the whole projection by `2 / width`
    // world units, so the corner a camera claims to show was not the corner it
    // actually showed. Small, but it makes every derived rectangle wrong.
    expect(view.screenToWorld(0, 0).x).toBeCloseTo(-400, 9);
    expect(view.screenToWorld(0, 0).y).toBeCloseTo(-300, 9);
    expect(view.screenToWorld(800, 600).x).toBeCloseTo(400, 9);
    expect(view.screenToWorld(800, 600).y).toBeCloseTo(300, 9);

    view.destroy();
  });

  test('the offset does not scale with the view size', () => {
    const small = new View(0, 0, 100, 100);
    const large = new View(0, 0, 4000, 4000);

    // The stray term was `2 / size`, so a small view drifted much further than
    // a large one - the error grew exactly where precision matters most.
    expect(small.screenToWorld(0, 0).x).toBeCloseTo(-50, 9);
    expect(large.screenToWorld(0, 0).x).toBeCloseTo(-2000, 9);

    small.destroy();
    large.destroy();
  });

  test('worldToScreen round-trips screenToWorld', () => {
    const view = new View(37, -14, 640, 480);

    view.setZoom(1.5);

    const world = view.screenToWorld(123, 456);
    const screen = view.worldToScreen(world.x, world.y);

    expect(screen.x).toBeCloseTo(123, 9);
    expect(screen.y).toBeCloseTo(456, 9);

    view.destroy();
  });
});
