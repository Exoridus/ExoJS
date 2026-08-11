import { Circle } from '#math/Circle';
import { Ellipse } from '#math/Ellipse';
import { Line } from '#math/Line';
import { Polygon } from '#math/Polygon';
import { Rectangle } from '#math/Rectangle';
import type { ShapeLike } from '#math/ShapeLike';
import { Vector } from '#math/Vector';

// One rule for every shape: `getBounds(out?)` writes into `out` when given one
// and returns a fresh rectangle otherwise. Before this contract the four
// implementations disagreed -- Rectangle cloned, Circle/Polygon allocated, and
// Vector handed out the global `Rectangle.temp`, so whether a returned box
// survived the next call depended on which shape you happened to ask.
const shapes: ReadonlyArray<{ readonly name: string; readonly make: () => ShapeLike; readonly expected: readonly [number, number, number, number] }> = [
  { name: 'Rectangle', make: () => new Rectangle(2, 3, 10, 20), expected: [2, 3, 10, 20] },
  { name: 'Circle', make: () => new Circle(10, 10, 4), expected: [6, 6, 8, 8] },
  { name: 'Ellipse', make: () => new Ellipse(10, 10, 4, 2), expected: [6, 8, 8, 4] },
  { name: 'Line', make: () => new Line(8, 1, 2, 5), expected: [2, 1, 6, 4] },
  { name: 'Polygon', make: () => new Polygon([new Vector(0, 0), new Vector(4, 0), new Vector(4, 6)], 1, 1), expected: [1, 1, 4, 6] },
  { name: 'Vector', make: () => new Vector(3, 4), expected: [3, 4, 0, 0] },
];

const asTuple = (rect: Rectangle): [number, number, number, number] => [rect.x, rect.y, rect.width, rect.height];

describe('ShapeLike.getBounds — one ownership rule for every shape', () => {
  for (const { name, make, expected } of shapes) {
    describe(name, () => {
      test('without `out`, returns a rectangle the caller owns', () => {
        const shape = make();
        const first = shape.getBounds();
        const second = shape.getBounds();

        expect(asTuple(first)).toEqual([...expected]);
        expect(first).not.toBe(second);

        // Mutating what we were handed must not reach the shape or the next
        // caller -- the failure mode `Vector`'s shared `Rectangle.temp` had.
        first.set(-99, -99, -99, -99);

        expect(asTuple(shape.getBounds())).toEqual([...expected]);
      });

      test('with `out`, writes into it and returns that very instance', () => {
        const shape = make();
        const out = new Rectangle(-1, -1, -1, -1);
        const result = shape.getBounds(out);

        expect(result).toBe(out);
        expect(asTuple(out)).toEqual([...expected]);
      });

      test('with `out`, allocates nothing the caller has to discard', () => {
        const shape = make();
        const out = new Rectangle();

        expect(shape.getBounds(out)).toBe(shape.getBounds(out));
      });

      test('never hands out the shared Rectangle.temp scratch', () => {
        const shape = make();

        expect(shape.getBounds()).not.toBe(Rectangle.temp);
      });
    });
  }

  // The specific regression: `Vector.getBounds()` used to return
  // `Rectangle.temp`, so two points asked in sequence reported the same box and
  // any unrelated user of the scratch clobbered the answer.
  test('two Vectors measured in sequence keep their own boxes', () => {
    const a = new Vector(1, 2).getBounds();
    const b = new Vector(30, 40).getBounds();

    expect(asTuple(a)).toEqual([1, 2, 0, 0]);
    expect(asTuple(b)).toEqual([30, 40, 0, 0]);
  });

  test('using Rectangle.temp for something else does not disturb a returned box', () => {
    const bounds = new Vector(1, 2).getBounds();

    Rectangle.temp.set(999, 999, 999, 999);

    expect(asTuple(bounds)).toEqual([1, 2, 0, 0]);
  });
});
