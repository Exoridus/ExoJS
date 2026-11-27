import { Color } from '#core/Color';
import { Circle } from '#math/Circle';
import { Ellipse } from '#math/Ellipse';
import { Polygon } from '#math/Polygon';
import { Vector } from '#math/Vector';
import { Graphics } from '#rendering/primitives/Graphics';
import { GraphicsPath } from '#rendering/primitives/GraphicsPath';

/**
 * Width of the same circle drawn through the immediate-mode API. Circles are
 * tessellated with a radius-dependent segment count that is not always a
 * multiple of four, so the polygon can stop short of the true horizontal
 * extent; a live source must match that tessellation, not the ideal circle.
 */
const immediateCircleWidth = (radius: number): number => {
  const graphics = new Graphics();

  graphics.fillColor = Color.red;
  graphics.drawCircle(0, 0, radius);
  const width = graphics.getChildAt(0).getLocalBounds().width;

  graphics.destroy();

  return width;
};

describe('Graphics live area sources', () => {
  test.each([
    [
      'circle',
      new Circle(0, 0, 10),
      (source: Circle) => {
        source.radius = 20;
      },
      immediateCircleWidth(20),
    ],
    [
      'ellipse',
      new Ellipse(0, 0, 10, 15),
      (source: Ellipse) => {
        source.radius.x = 20;
      },
      40,
    ],
    [
      'polygon',
      new Polygon([new Vector(0, 0), new Vector(10, 0), new Vector(0, 10)]),
      (source: Polygon) => {
        source.points[1]!.x = 20;
        source.updateGeometry();
      },
      20,
    ],
    [
      'path',
      new GraphicsPath().rect(0, 0, 10, 10),
      (source: GraphicsPath) => {
        source.clear().rect(0, 0, 20, 10);
      },
      20,
    ],
  ] as const)('%s updates independent retained drawings without replacing handles', (_name, source, update, width) => {
    const first = new Graphics({ fill: Color.red });
    const second = new Graphics({ fill: Color.blue });
    const handle = first.addShape(source);
    second.addShape(source);
    (update as (value: typeof source) => void)(source);
    expect(first.getShape(source)).toBe(handle);
    expect(first.getChildAt(0).getLocalBounds().width).toBeCloseTo(width);
    expect(second.getChildAt(0).getLocalBounds().width).toBeCloseTo(width);
    first.destroy();
    second.destroy();
  });

  test('a registered circle keeps its exact mathematical bounds while its drawing uses the tessellated extent', () => {
    const source = new Circle(0, 0, 10);
    const graphics = new Graphics({ fill: Color.red });

    graphics.addShape(source);
    source.radius = 20;

    expect(source.getBounds().width).toBe(40);
    expect(graphics.getChildAt(0).getLocalBounds().width).toBeLessThan(40);
    expect(graphics.getChildAt(0).getLocalBounds().width).toBeCloseTo(immediateCircleWidth(20));

    graphics.destroy();
    source.destroy();
  });

  test('an initially empty path can become visible and empty again', () => {
    const source = new GraphicsPath();
    const graphics = new Graphics({ fill: Color.red });
    const handle = graphics.addShape(source);
    expect(graphics.getChildAt(0).visible).toBe(false);
    source.rect(0, 0, 10, 10);
    expect(graphics.getChildAt(0).visible).toBe(true);
    handle.setStyle({ fill: null });
    source.clear().rect(0, 0, 20, 10);
    expect(graphics.getChildAt(0).visible).toBe(false);
    handle.setStyle({ fill: Color.blue });
    expect(graphics.getChildAt(0).visible).toBe(true);
    source.clear();
    expect(graphics.getChildAt(0).visible).toBe(false);
    graphics.destroy();
  });
});
