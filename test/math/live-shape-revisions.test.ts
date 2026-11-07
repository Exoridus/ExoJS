import { vi } from 'vitest';

import { Circle } from '#math/Circle';
import { Ellipse } from '#math/Ellipse';
import { Line } from '#math/Line';
import { Polygon } from '#math/Polygon';
import { Vector } from '#math/Vector';
import { GraphicsPath } from '#rendering/primitives/GraphicsPath';

describe('live Math geometry sources', () => {
  test('path commands and clear notify without copying subscriptions to clones', () => {
    const path = new GraphicsPath();
    const changed = vi.fn();
    const off = path._subscribeGeometry(changed);
    path.rect(0, 0, 10, 10);
    expect(changed).toHaveBeenCalled();
    const revision = path._geometryRevision;
    const clone = path.clone();
    changed.mockClear();
    clone.lineTo(20, 30);
    expect(changed).not.toHaveBeenCalled();
    expect(path._geometryRevision).toBe(revision);
    path.clear();
    expect(changed).toHaveBeenCalledOnce();
    changed.mockClear();
    path.clear();
    expect(changed).not.toHaveBeenCalled();
    off();
    path.moveTo(2, 3);
    expect(changed).not.toHaveBeenCalled();
  });

  test('combined setters publish complete geometry once', () => {
    const circle = new Circle();
    const circleListener = vi.fn(() => expect(circle.radius).toBe(9));
    circle._subscribeGeometry(circleListener);
    circle.set(4, 5, 9);
    expect(circleListener).toHaveBeenCalledOnce();
    circle.set(4, 5, 9);
    expect(circleListener).toHaveBeenCalledOnce();

    const ellipse = new Ellipse();
    const ellipseListener = vi.fn(() => expect(ellipse.rx).toBe(6));
    ellipse._subscribeGeometry(ellipseListener);
    ellipse.set(2, 3, 6, 7);
    expect(ellipseListener).toHaveBeenCalledOnce();

    const line = new Line();
    const lineListener = vi.fn(() => expect(line.toX).toBe(8));
    line._subscribeGeometry(lineListener);
    line.set(2, 3, 8, 9);
    expect(lineListener).toHaveBeenCalledOnce();
    circle.destroy();
    ellipse.destroy();
    line.destroy();
  });

  test.each([
    [
      'circle',
      () => new Circle(0, 0, 10),
      (shape: Circle) => {
        shape.position.x = 7;
      },
    ],
    [
      'ellipse',
      () => new Ellipse(0, 0, 10, 20),
      (shape: Ellipse) => {
        shape.radius.y = 7;
      },
    ],
    [
      'line',
      () => new Line(0, 0, 10, 20),
      (shape: Line) => {
        shape.toPosition.x = 7;
      },
    ],
  ] as const)('%s exposes live vector writes to multiple independent listeners', (_name, create, mutate) => {
    const shape = create();
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribe = shape._subscribeGeometry(first);
    const off = shape._subscribeGeometry(second);
    const revision = shape._geometryRevision;
    (mutate as (value: typeof shape) => void)(shape);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(shape._geometryRevision).toBeGreaterThan(revision);
    unsubscribe();
    unsubscribe();
    first.mockClear();

    if (shape instanceof Line) {
      shape.fromX = 12;
    } else {
      shape.x = 12;
    }

    expect(first).not.toHaveBeenCalled();
    off();
    expect(shape).toHaveProperty('_geometryListeners', null);
    shape.destroy();
  });

  test('shape vectors preserve identity, Vector queries and detached clone semantics', () => {
    const circle = new Circle(1, 2, 3);
    const vector = circle.position;
    const changed = vi.fn();
    circle._subscribeGeometry(changed);
    expect(vector).toBeInstanceOf(Vector);
    expect(JSON.parse(JSON.stringify(vector))).toEqual({ x: 1, y: 2 });
    const clone = vector.clone();
    clone.x = 9;
    expect(changed).not.toHaveBeenCalled();
    circle.position = new Vector(4, 5);
    expect(circle.position).toBe(vector);
    expect(vector.equals({ x: 4, y: 5 })).toBe(true);
    changed.mockClear();
    vector.set(4, 5);
    expect(changed).not.toHaveBeenCalled();
    circle.destroy();
    vector.x = 17;
    expect(changed).not.toHaveBeenCalled();
  });

  test('polygon vertex edits are committed synchronously and setPoints commits automatically', () => {
    const polygon = new Polygon([new Vector(0, 0), new Vector(10, 0), new Vector(0, 10)]);
    const changed = vi.fn();
    polygon._subscribeGeometry(changed);
    polygon.getNormals();
    polygon.points[1]!.y = 10;
    expect(changed).not.toHaveBeenCalled();
    expect(polygon.updateGeometry()).toBe(polygon);
    expect(changed).toHaveBeenCalledOnce();
    expect(polygon.edges[0]!.equals({ x: 10, y: 10 })).toBe(true);
    expect(polygon.getNormals()[0]!.x).not.toBe(0);
    polygon.setPoints([new Vector(0, 0), new Vector(20, 0), new Vector(0, 20)]);
    expect(changed).toHaveBeenCalledTimes(2);
    polygon.points.push(new Vector(20, 20));
    polygon.updateGeometry();
    expect(polygon.edges).toHaveLength(4);
    polygon.points.pop();
    polygon.updateGeometry();
    expect(polygon.edges).toHaveLength(3);
    polygon.destroy();
  });
});
