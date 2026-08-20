import { View } from '#rendering/View';

const WIDTH = 800;
const HEIGHT = 600;

describe('View rotation pivots around the camera center', () => {
  test.each([
    { angle: 0, centerX: 120, centerY: -60 },
    { angle: 30, centerX: 120, centerY: -60 },
    { angle: 45, centerX: 0, centerY: 0 },
    { angle: 90, centerX: -400, centerY: 250 },
    { angle: -60, centerX: 75, centerY: 75 },
    { angle: 200, centerX: 1000, centerY: -1000 },
  ])('the camera looks at its center at $angle deg, center ($centerX, $centerY)', ({ angle, centerX, centerY }) => {
    const view = new View(centerX, centerY, WIDTH, HEIGHT);

    view.setRotation(angle);

    // The projection applied `R · world - centre` instead of
    // `R · (world - centre)`, so a rotated camera looked at `R⁻¹ · centre`
    // rather than the position it was told to look at - at 30 degrees with
    // centre (120, -60) the middle of the viewport landed on (133.93, 8.04).
    const world = view.screenToWorld(WIDTH / 2, HEIGHT / 2);

    expect(world.x).toBeCloseTo(centerX, 6);
    expect(world.y).toBeCloseTo(centerY, 6);

    view.destroy();
  });

  test('worldToScreen puts the center in the middle of a rotated viewport', () => {
    const view = new View(120, -60, WIDTH, HEIGHT);

    view.setRotation(30);

    const screen = view.worldToScreen(120, -60);

    expect(screen.x).toBeCloseTo(WIDTH / 2, 6);
    expect(screen.y).toBeCloseTo(HEIGHT / 2, 6);

    view.destroy();
  });

  test('rotating a camera in place does not move what it looks at', () => {
    const view = new View(300, -200, WIDTH, HEIGHT);

    const before = view.screenToWorld(WIDTH / 2, HEIGHT / 2);

    view.setRotation(75);

    const after = view.screenToWorld(WIDTH / 2, HEIGHT / 2);

    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);

    view.destroy();
  });

  test('the pivot holds under zoom', () => {
    const view = new View(-250, 480, WIDTH, HEIGHT);

    view.setRotation(37);
    view.setZoom(2.5);

    // Zoom shrinks the design space, so the middle of the viewport moves with it.
    const world = view.screenToWorld(view.width / 2, view.height / 2);

    expect(world.x).toBeCloseTo(-250, 6);
    expect(world.y).toBeCloseTo(480, 6);

    view.destroy();
  });

  test('the cull bounds of a rotated camera stay centred on it', () => {
    const view = new View(120, -60, WIDTH, HEIGHT);

    view.setRotation(30);

    const bounds = view.getBounds();

    expect(bounds.x + bounds.width / 2).toBeCloseTo(120, 6);
    expect(bounds.y + bounds.height / 2).toBeCloseTo(-60, 6);

    view.destroy();
  });
});
