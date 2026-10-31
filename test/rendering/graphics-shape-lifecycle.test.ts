import { Color } from '#core/Color';
import { Circle } from '#math/Circle';
import { Ellipse } from '#math/Ellipse';
import { Polygon } from '#math/Polygon';
import { Rectangle } from '#math/Rectangle';
import { Vector } from '#math/Vector';
import type { Mesh } from '#rendering/mesh/Mesh';
import { Graphics } from '#rendering/primitives/Graphics';

const sources = (): ReadonlyArray<readonly [string, Rectangle | Circle | Ellipse | Polygon]> => [
  ['rectangle', new Rectangle(0, 0, 10, 10)],
  ['circle', new Circle(0, 0, 10)],
  ['ellipse', new Ellipse(0, 0, 10, 5)],
  ['polygon', new Polygon([new Vector(0, 0), new Vector(10, 0), new Vector(0, 10)])],
];

describe('Graphics shape source lifecycle', () => {
  test.each(sources())('destroying a %s source removes its drawing from every Graphics', (_name, source) => {
    const first = new Graphics({ fill: Color.red });
    const second = new Graphics({ fill: Color.blue });
    const firstHandle = first.addShape(source);
    const secondHandle = second.addShape(source);
    const firstMesh = first.getChildAt(0) as Mesh;

    source.destroy();

    expect(first.getShape(source)).toBeNull();
    expect(second.getShape(source)).toBeNull();
    expect(first.children).toHaveLength(0);
    expect(second.children).toHaveLength(0);
    expect(firstMesh.destroyed).toBe(true);
    expect(firstHandle.removed).toBe(true);
    expect(secondHandle.removed).toBe(true);
    expect(() => firstHandle.setStyle({ fill: Color.green })).toThrow();

    first.destroy();
    second.destroy();
  });

  test('a live handle reports that it is not removed', () => {
    const source = new Circle(0, 0, 10);
    const graphics = new Graphics({ fill: Color.red });
    const handle = graphics.addShape(source);

    expect(handle.removed).toBe(false);

    graphics.clear();

    expect(handle.removed).toBe(true);
    source.destroy();
  });

  test('Graphics never destroys a borrowed source', () => {
    const source = new Circle(0, 0, 10);
    const cleared = new Graphics({ fill: Color.red });
    const destroyed = new Graphics({ fill: Color.red });
    const survivor = new Graphics({ fill: Color.red });

    cleared.addShape(source);
    destroyed.addShape(source);
    survivor.addShape(source);
    cleared.clear();
    destroyed.destroy();

    source.radius = 20;

    expect(source.radius).toBe(20);
    expect(survivor.getChildAt(0).getLocalBounds().width).toBeGreaterThan(30);

    source.destroy();
    cleared.destroy();
    survivor.destroy();
  });

  test('a source can be destroyed after the Graphics that used it', () => {
    const source = new Rectangle(0, 0, 10, 10);
    const graphics = new Graphics({ fill: Color.red });

    graphics.addShape(source);
    graphics.destroy();

    expect(() => source.destroy()).not.toThrow();
  });

  test('destroying the source from inside its own change notification removes the drawing without further updates', () => {
    const source = new Circle(0, 0, 10);
    const early = new Graphics({ fill: Color.red });
    const late = new Graphics({ fill: Color.blue });

    early.addShape(source);
    source._subscribeGeometry(() => source.destroy());
    late.addShape(source);

    expect(() => {
      source.radius = 20;
    }).not.toThrow();
    expect(early.getShape(source)).toBeNull();
    expect(late.getShape(source)).toBeNull();
    expect(late.children).toHaveLength(0);

    early.destroy();
    late.destroy();
  });

  test('a throwing release subscriber does not keep other Graphics registered', () => {
    const source = new Rectangle(0, 0, 10, 10);
    const first = new Graphics({ fill: Color.red });
    const second = new Graphics({ fill: Color.blue });

    first.addShape(source);
    source._subscribeGeometry(
      () => {},
      () => {
        throw new Error('release failed');
      },
    );
    second.addShape(source);

    expect(() => source.destroy()).toThrow('release failed');
    expect(first.getShape(source)).toBeNull();
    expect(second.getShape(source)).toBeNull();

    first.destroy();
    second.destroy();
  });

  test('the same source can be registered again after a clear', () => {
    const source = new Ellipse(0, 0, 10, 5);
    const graphics = new Graphics({ fill: Color.red });

    graphics.addShape(source);
    graphics.clear();
    graphics.addShape(source);
    source.destroy();

    expect(graphics.children).toHaveLength(0);
    graphics.destroy();
  });
});
