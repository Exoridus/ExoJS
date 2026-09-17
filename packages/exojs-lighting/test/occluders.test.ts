import { type AabbLike, Container, Matrix, Rectangle } from '@codexo/exojs';
import { describe, expect, test } from 'vitest';

import { type OccluderCollider, type OccluderPhysicsWorld } from '../src/occluders/fromPhysics';
import type { OccluderTileCell, OccluderTileLayer } from '../src/occluders/fromTilemap';
import { OccluderField } from '../src/occluders/OccluderField';
import { Occluders } from '../src/occluders/Occluders';
import type { OccluderSource } from '../src/occluders/OccluderSource';
import { tileBoundarySegments } from '../src/occluders/tileBoundary';

const everywhere = new Rectangle(-1000, -1000, 2000, 2000);

/** The segments a source collects for `region`, as `x1,y1,x2,y2` strings. */
const collect = (source: OccluderSource, region: Rectangle = everywhere): string[] => {
  const field = new OccluderField();

  field.collect([source], region);

  const out: string[] = [];

  for (let index = 0; index < field.count; index++) {
    const offset = index * 4;

    out.push([...field.segments.slice(offset, offset + 4)].map(value => Math.round(value * 1000) / 1000).join(','));
  }

  return out;
};

describe('OccluderField', () => {
  test('a polyline becomes one segment per edge, and closing adds the last one', () => {
    const field = new OccluderField();

    field.collect(
      [
        {
          collect(_bounds, out) {
            out.addPolyline([0, 0, 10, 0, 10, 10], true);
          },
        },
      ],
      everywhere,
    );

    expect(field.count).toBe(3);
  });

  test('an open polyline leaves the loop unclosed', () => {
    const field = new OccluderField();

    field.collect([{ collect: (_bounds, out) => out.addPolyline([0, 0, 10, 0, 10, 10], false) }], everywhere);

    expect(field.count).toBe(2);
  });

  test('a degenerate segment is dropped, because it can never shadow anything', () => {
    const field = new OccluderField();

    field.collect([{ collect: (_bounds, out) => out.addSegment(5, 5, 5, 5) }], everywhere);

    expect(field.count).toBe(0);
  });

  test('the buffer grows past its initial capacity rather than truncating', () => {
    const field = new OccluderField();

    field.collect(
      [
        {
          collect(_bounds, out) {
            for (let index = 0; index < 5000; index++) {
              out.addSegment(index, 0, index, 1);
            }
          },
        },
      ],
      everywhere,
    );

    expect(field.count).toBe(5000);
    expect(field.segments[4999 * 4]).toBe(4999);
  });

  test('collecting again discards the previous frame', () => {
    const field = new OccluderField();
    const source: OccluderSource = { collect: (_bounds, out) => out.addSegment(0, 0, 1, 1) };

    field.collect([source], everywhere);
    field.collect([source], everywhere);

    expect(field.count).toBe(1);
  });

  test('an empty region collects nothing', () => {
    const field = new OccluderField();

    field.collect([{ collect: (_bounds, out) => out.addSegment(0, 0, 1, 1) }], new Rectangle(0, 0, 0, 0));

    expect(field.count).toBe(0);
  });
});

describe('Occluders.fromPolygon', () => {
  test('a closed outline joins its last point back to its first', () => {
    const source = Occluders.fromPolygon([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);

    expect(collect(source)).toEqual(['0,0,10,0', '10,0,10,10', '10,10,0,0']);
  });

  test('the node transform places the outline, so a moved carrier moves its shadow', () => {
    const carrier = new Container().setPosition(100, 50);
    const source = Occluders.fromPolygon(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      { closed: false, node: carrier },
    );

    expect(collect(source)).toEqual(['100,50,110,50']);

    carrier.setPosition(0, 0);

    expect(collect(source)).toEqual(['0,0,10,0']);
  });

  test('an outline entirely outside the region is skipped', () => {
    const source = Occluders.fromPolygon([
      { x: 900, y: 900 },
      { x: 910, y: 900 },
    ]);

    expect(collect(source, new Rectangle(0, 0, 100, 100))).toEqual([]);
  });

  test('fewer than two points describes nothing', () => {
    expect(collect(Occluders.fromPolygon([{ x: 1, y: 2 }]))).toEqual([]);
  });
});

describe('tileBoundarySegments', () => {
  const solidRect = (minX: number, minY: number, maxX: number, maxY: number) => (tx: number, ty: number) =>
    tx >= minX && tx <= maxX && ty >= minY && ty <= maxY;

  test('a run of cells outlines as four merged edges rather than one per cell', () => {
    const segments = tileBoundarySegments(solidRect(0, 0, 3, 0), 0, 0, 3, 0, 16, 16, 0, 0);

    expect(segments.length / 4).toBe(4);
  });

  test('the interior of a block costs nothing', () => {
    const wide = tileBoundarySegments(solidRect(0, 0, 7, 7), 0, 0, 7, 7, 16, 16, 0, 0);

    expect(wide.length / 4).toBe(4);
  });

  test('coordinates come back in layer pixels, offset by the layer origin', () => {
    const segments = tileBoundarySegments(solidRect(0, 0, 0, 0), 0, 0, 0, 0, 16, 16, 100, 200);

    expect([...segments.slice(0, 4)]).toEqual([100, 200, 116, 200]);
  });

  test('a neighbour outside the emitted region keeps the border from becoming a wall', () => {
    // Cells 0..3 are solid, but only 0..1 are emitted: the edge at x = 2 has a
    // solid neighbour and must not appear.
    const segments = tileBoundarySegments(solidRect(0, 0, 3, 0), 0, 0, 1, 0, 16, 16, 0, 0);
    const vertical = [...segments].filter((_value, index) => index % 4 === 0).length;

    expect(vertical).toBe(3);
  });
});

describe('Occluders.fromTilemap', () => {
  class FakeLayer implements OccluderTileLayer<number> {
    public readonly tileWidth = 16;
    public readonly tileHeight = 16;
    public readonly offsetX = 0;
    public readonly offsetY = 0;
    public revision = 0;
    public walks = 0;
    public cells = new Set<string>(['0,0']);

    public *tilesInRect(x: number, y: number, width: number, height: number): Generator<OccluderTileCell<number>> {
      this.walks++;

      for (let ty = y; ty < y + height; ty++) {
        for (let tx = x; tx < x + width; tx++) {
          if (this.cells.has(`${tx},${ty}`)) {
            yield { tx, ty, tile: 1 };
          }
        }
      }
    }
  }

  test('an occupied cell outlines as its four edges', () => {
    const source = Occluders.fromTilemap(new FakeLayer(), { blockSize: 4 });

    expect(collect(source, new Rectangle(0, 0, 64, 64))).toHaveLength(4);
  });

  test('a second collect over the same block reuses the cached outline', () => {
    const layer = new FakeLayer();
    const source = Occluders.fromTilemap(layer, { blockSize: 4 });
    const region = new Rectangle(0, 0, 64, 64);

    collect(source, region);
    const afterFirst = layer.walks;
    collect(source, region);

    expect(layer.walks).toBe(afterFirst);
  });

  test('a changed revision rebuilds the block, which is how a streamed chunk arrives', () => {
    const layer = new FakeLayer();
    const source = Occluders.fromTilemap(layer, { blockSize: 4 });
    const region = new Rectangle(0, 0, 64, 64);

    collect(source, region);
    layer.cells.add('1,0');
    layer.revision++;

    expect(collect(source, region)).toHaveLength(4);
  });

  test('`solid` decides which tiles block, so a mixed layer works too', () => {
    const layer = new FakeLayer();

    layer.cells.add('1,0');

    const source = Occluders.fromTilemap(layer, { blockSize: 4, solid: (_tile, tx) => tx === 0 });

    expect(collect(source, new Rectangle(0, 0, 64, 64))).toHaveLength(4);
  });

  test('the node transform places the layer', () => {
    const carrier = new Container().setPosition(1000, 0);
    const source = Occluders.fromTilemap(new FakeLayer(), { blockSize: 4, node: carrier });

    expect(collect(source, new Rectangle(1000, 0, 64, 64))[0]).toBe('1000,0,1016,0');
  });
});

describe('Occluders.fromPhysics', () => {
  const transform = (x: number, y: number, angle = 0) => ({ x, y, sin: Math.sin(angle), cos: Math.cos(angle) });

  const worldOf = (...colliders: OccluderCollider[]): OccluderPhysicsWorld => ({
    forEachAabbHit(_bounds: AabbLike, _filter: undefined, callback: (collider: OccluderCollider) => void): void {
      colliders.forEach(callback);
    },
  });

  const box = (): OccluderCollider => ({
    shape: { type: 'polygon', vertices: [-8, -8, 8, -8, 8, 8, -8, 8] },
    worldTransform: transform(100, 100),
    isSensor: false,
    body: { type: 'static' },
  });

  test('a polygon collider outlines as its world-space ring', () => {
    expect(collect(Occluders.fromPhysics(worldOf(box())))).toEqual(['92,92,108,92', '108,92,108,108', '108,108,92,108', '92,108,92,92']);
  });

  test('the collider rotation reaches the outline', () => {
    const rotated = { ...box(), worldTransform: transform(0, 0, Math.PI / 2) };

    expect(collect(Occluders.fromPhysics(worldOf(rotated)))[0]).toBe('8,-8,8,8');
  });

  test('a dynamic body is left out unless asked for', () => {
    const dynamic = { ...box(), body: { type: 'dynamic' } };

    expect(collect(Occluders.fromPhysics(worldOf(dynamic)))).toEqual([]);
    expect(collect(Occluders.fromPhysics(worldOf(dynamic), { staticOnly: false }))).toHaveLength(4);
  });

  test('a sensor is a trigger volume, not a wall', () => {
    const sensor = { ...box(), isSensor: true };

    expect(collect(Occluders.fromPhysics(worldOf(sensor)))).toEqual([]);
    expect(collect(Occluders.fromPhysics(worldOf(sensor), { sensors: true }))).toHaveLength(4);
  });

  test('`accept` has the last word', () => {
    expect(collect(Occluders.fromPhysics(worldOf(box()), { accept: () => false }))).toEqual([]);
  });

  test('a circle is approximated with the requested number of edges', () => {
    const circle: OccluderCollider = {
      shape: { type: 'circle', radius: 10 },
      worldTransform: transform(0, 0),
      isSensor: false,
      body: { type: 'static' },
    };

    expect(collect(Occluders.fromPhysics(worldOf(circle), { circleSegments: 8 }))).toHaveLength(8);
  });

  test('a segment collider is one edge and is never closed into a loop', () => {
    const segment: OccluderCollider = {
      shape: { type: 'segment', vertices: [0, 0, 20, 0] },
      worldTransform: transform(5, 5),
      isSensor: false,
      body: { type: 'static' },
    };

    expect(collect(Occluders.fromPhysics(worldOf(segment)))).toEqual(['5,5,25,5']);
  });

  test('an open chain stays open and a closed one comes back closed', () => {
    const path = [0, 0, 10, 0, 10, 10];
    const open: OccluderCollider = {
      shape: { type: 'chain', vertices: path, closed: false },
      worldTransform: transform(0, 0),
      isSensor: false,
      body: { type: 'static' },
    };

    expect(collect(Occluders.fromPhysics(worldOf(open)))).toHaveLength(2);
    expect(collect(Occluders.fromPhysics(worldOf({ ...open, shape: { type: 'chain', vertices: path, closed: true } })))).toHaveLength(3);
  });

  test('a capsule closes into a ring of both its caps', () => {
    const capsule: OccluderCollider = {
      shape: { type: 'capsule', vertices: [-10, 0, 10, 0], radius: 5 },
      worldTransform: transform(0, 0),
      isSensor: false,
      body: { type: 'static' },
    };

    expect(collect(Occluders.fromPhysics(worldOf(capsule), { circleSegments: 4 }))).toHaveLength(8);
  });

  test('the query is the region the lights reach', () => {
    const seen: AabbLike[] = [];
    const world: OccluderPhysicsWorld = {
      forEachAabbHit(bounds: AabbLike): void {
        seen.push({ ...bounds });
      },
    };

    collect(Occluders.fromPhysics(world), new Rectangle(10, 20, 30, 40));

    expect(seen).toEqual([{ minX: 10, minY: 20, maxX: 40, maxY: 60 }]);
  });
});

describe('OccluderPlacement', () => {
  test('anything with a world transform places an outline, node or not', () => {
    const matrix = new Matrix().set(2, 0, 7, 0, 2, 9);
    const source = Occluders.fromPolygon(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      { closed: false, node: { getWorldTransform: () => matrix } },
    );

    expect(collect(source)).toEqual(['7,9,9,9']);
  });
});
