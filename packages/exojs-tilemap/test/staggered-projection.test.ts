import { describe, expect, it } from 'vitest';

import { TileProjection, type TileProjectionOptions } from '../src/TileProjection';

type Point = readonly [number, number];

/** The outline of cell (tx, ty) as Tiled draws it, from the projection's own placement. */
const cellOutline = (projection: TileProjection, tx: number, ty: number): Point[] => {
  const { x, y } = projection.tileToPixel(tx, ty);
  const w = projection.tileWidth;
  const h = projection.tileHeight;
  const side = projection.hexSideLength;

  if (projection.staggerAxis === 'x') {
    const offset = (w - side) / 2;

    return [
      [x + offset, y],
      [x + offset + side, y],
      [x + w, y + h / 2],
      [x + offset + side, y + h],
      [x + offset, y + h],
      [x, y + h / 2],
    ];
  }

  const offset = (h - side) / 2;

  return [
    [x + w / 2, y],
    [x + w, y + offset],
    [x + w, y + offset + side],
    [x + w / 2, y + h],
    [x, y + offset + side],
    [x, y + offset],
  ];
};

/** Signed distance from `point` to the inside of a convex clockwise outline (positive = inside). */
const insideBy = (outline: readonly Point[], [px, py]: Point): number => {
  let margin = Infinity;

  for (let i = 0; i < outline.length; i++) {
    const [ax, ay] = outline[i]!;
    const [bx, by] = outline[(i + 1) % outline.length]!;
    const length = Math.hypot(bx - ax, by - ay);

    if (length === 0) {
      continue;
    }

    // Screen space is y-down, so a clockwise outline keeps its inside on the right.
    margin = Math.min(margin, ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) / length);
  }

  return margin;
};

// Deterministic pseudo-random sampling so a failure reproduces.
const sampler = (seed: number): (() => number) => {
  let state = seed;

  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;

    return state / 2147483648;
  };
};

const layouts: ReadonlyArray<{ readonly name: string; readonly options: TileProjectionOptions }> = [
  { name: 'staggered y odd', options: { orientation: 'staggered', tileWidth: 64, tileHeight: 32 } },
  { name: 'staggered y even', options: { orientation: 'staggered', tileWidth: 64, tileHeight: 32, staggerIndex: 'even' } },
  { name: 'staggered x odd', options: { orientation: 'staggered', tileWidth: 64, tileHeight: 32, staggerAxis: 'x' } },
  {
    name: 'staggered x even',
    options: { orientation: 'staggered', tileWidth: 64, tileHeight: 32, staggerAxis: 'x', staggerIndex: 'even' },
  },
  { name: 'hexagonal y odd', options: { orientation: 'hexagonal', tileWidth: 28, tileHeight: 32, hexSideLength: 16 } },
  {
    name: 'hexagonal y even',
    options: { orientation: 'hexagonal', tileWidth: 28, tileHeight: 32, hexSideLength: 16, staggerIndex: 'even' },
  },
  { name: 'hexagonal x odd', options: { orientation: 'hexagonal', tileWidth: 32, tileHeight: 28, hexSideLength: 16, staggerAxis: 'x' } },
  {
    name: 'hexagonal x even',
    options: { orientation: 'hexagonal', tileWidth: 32, tileHeight: 28, hexSideLength: 16, staggerAxis: 'x', staggerIndex: 'even' },
  },
];

describe('staggered and hexagonal projection', () => {
  it('lays out staggered rows half a cell apart, as Tiled does', () => {
    const odd = new TileProjection({ orientation: 'staggered', tileWidth: 64, tileHeight: 32 });
    const even = new TileProjection({ orientation: 'staggered', tileWidth: 64, tileHeight: 32, staggerIndex: 'even' });

    expect(odd.tileToPixel(0, 0)).toEqual({ x: 0, y: 0 });
    expect(odd.tileToPixel(0, 1)).toEqual({ x: 32, y: 16 });
    expect(odd.tileToPixel(1, 1)).toEqual({ x: 96, y: 16 });
    expect(odd.tileToPixel(0, 2)).toEqual({ x: 0, y: 32 });
    expect(odd.tileToPixel(-1, -1)).toEqual({ x: -32, y: -16 });
    expect(even.tileToPixel(0, 0)).toEqual({ x: 32, y: 0 });
    expect(even.tileToPixel(0, 1)).toEqual({ x: 0, y: 16 });
  });

  it('lays out hexagons with their straight sides along the stagger axis', () => {
    const pointy = new TileProjection({ orientation: 'hexagonal', tileWidth: 28, tileHeight: 32, hexSideLength: 16, originX: 5 });
    const flat = new TileProjection({ orientation: 'hexagonal', tileWidth: 32, tileHeight: 28, hexSideLength: 16, staggerAxis: 'x' });

    expect(pointy.tileToPixel(1, 0)).toEqual({ x: 5 + 28, y: 0 });
    expect(pointy.tileToPixel(0, 1)).toEqual({ x: 5 + 14, y: 24 });
    expect(flat.tileToPixel(1, 0)).toEqual({ x: 24, y: 14 });
    expect(flat.tileToPixel(2, 0)).toEqual({ x: 48, y: 0 });
    expect(flat.tileToPixel(0, 1)).toEqual({ x: 0, y: 28 });
  });

  it("measures a map the size Tiled gives it, including the shifted rows' overhang", () => {
    const staggered = new TileProjection({ orientation: 'staggered', tileWidth: 64, tileHeight: 32 });
    const flat = new TileProjection({ orientation: 'hexagonal', tileWidth: 32, tileHeight: 28, hexSideLength: 16, staggerAxis: 'x' });

    expect(staggered.getBounds(0, 0, 4, 4)).toEqual({ x: 0, y: 0, width: 4 * 64 + 32, height: 4 * 16 + 16 });
    expect(staggered.getBounds(0, 0, 4, 1)).toEqual({ x: 0, y: 0, width: 4 * 64, height: 32 });
    expect(flat.getBounds(0, 0, 3, 2)).toEqual({ x: 0, y: 0, width: 3 * 24 + 8, height: 2 * 28 + 14 });
  });

  for (const { name, options } of layouts) {
    it(`${name}: picks every cell from its centre and from anywhere inside it`, () => {
      const projection = new TileProjection({ ...options, originX: 7, originY: -3 });
      const random = sampler(17);
      let inside = 0;

      for (let ty = -4; ty <= 4; ty++) {
        for (let tx = -4; tx <= 4; tx++) {
          const { x, y } = projection.tileToPixel(tx, ty);

          expect(projection.pixelToTile(x + projection.tileWidth / 2, y + projection.tileHeight / 2), `centre of ${tx},${ty}`).toEqual({
            tx,
            ty,
          });

          const outline = cellOutline(projection, tx, ty);

          for (let sample = 0; sample < 40; sample++) {
            const point: Point = [x + random() * projection.tileWidth, y + random() * projection.tileHeight];

            if (insideBy(outline, point) > 0.5) {
              inside++;
              expect(projection.pixelToTile(point[0], point[1]), `${point.join(',')} in ${tx},${ty}`).toEqual({ tx, ty });
            }
          }
        }
      }

      // Most samples land well inside a cell; this guards the outline orientation.
      expect(inside).toBeGreaterThan(81 * 40 * 0.3);
    });
  }

  it('orders cells into bands: rows, or unshifted then shifted columns of a row', () => {
    const rows = new TileProjection({ orientation: 'staggered', tileWidth: 64, tileHeight: 32 });
    const columns = new TileProjection({ orientation: 'hexagonal', tileWidth: 32, tileHeight: 28, hexSideLength: 16, staggerAxis: 'x' });

    expect([rows._band(3, 0), rows._band(0, 1), rows._band(5, 2)]).toEqual([0, 1, 2]);
    expect([columns._band(0, 0), columns._band(1, 0), columns._band(2, 0), columns._band(1, 1)]).toEqual([0, 1, 0, 3]);
  });

  it('keeps objects in plain pixels, as Tiled stores them on these maps', () => {
    const projection = new TileProjection({ orientation: 'hexagonal', tileWidth: 28, tileHeight: 32, hexSideLength: 16, originX: 10 });

    expect(projection.logicalToPixel(40, 50)).toEqual({ x: 50, y: 50 });
    expect(projection.pixelToLogical(50, 50)).toEqual({ x: 40, y: 50 });
  });

  it('rejects a negative or fractional side length', () => {
    expect(() => new TileProjection({ orientation: 'hexagonal', tileWidth: 28, tileHeight: 32, hexSideLength: -1 })).toThrow(
      /hexSideLength/,
    );
    expect(() => new TileProjection({ orientation: 'hexagonal', tileWidth: 28, tileHeight: 32, hexSideLength: 1.5 })).toThrow(
      /hexSideLength/,
    );
  });
});
