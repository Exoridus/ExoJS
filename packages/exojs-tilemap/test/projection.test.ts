import { describe, expect, it } from 'vitest';

import { TileLayer } from '../src/TileLayer';
import { TileMap } from '../src/TileMap';
import { TileProjection } from '../src/TileProjection';

describe('isometric projection', () => {
  const projection = () => new TileProjection({ orientation: 'isometric', tileWidth: 64, tileHeight: 32, originX: 128 });

  it('projects cell vertices and logical positions with an explicit origin', () => {
    const p = projection();
    expect(p.tileToPixel(2, 1)).toEqual({ x: 160, y: 48 });
    expect(p.logicalToPixel(64, 32)).toEqual({ x: 160, y: 48 });
    expect(p.pixelToLogical(160, 48)).toEqual({ x: 64, y: 32 });
    expect(p.getBounds(0, 0, 3, 4)).toEqual({ x: 0, y: 0, width: 224, height: 112 });
  });

  it('roundtrips signed fractional logical coordinates', () => {
    const p = projection();
    for (const x of [-256, -0.25, 0, 15.5, 1000]) {
      for (const y of [-127, -0.5, 0, 23.25, 512]) {
        const screen = p.logicalToPixel(x, y);
        const logical = p.pixelToLogical(screen.x, screen.y);
        expect(logical.x).toBeCloseTo(x, 10);
        expect(logical.y).toBeCloseTo(y, 10);
      }
    }
  });

  it('picks half-open cells on both diamond axes, including negative boundaries', () => {
    const p = projection();
    for (const tx of [-2, 0, 3]) {
      for (const ty of [-1, 0, 2]) {
        for (const [dx, dy, expectedX, expectedY] of [
          [0, 0, tx, ty],
          [-0.001, 0.5, tx - 1, ty],
          [0.5, -0.001, tx, ty - 1],
          [0.999, 0.999, tx, ty],
        ]) {
          const screen = p.tileToPixel(tx + dx!, ty + dy!);
          expect(p.pixelToTile(screen.x, screen.y)).toEqual({ tx: expectedX, ty: expectedY });
        }
      }
    }
  });

  it('shares projection between map and independently placed layer', () => {
    const p = projection();
    const layer = new TileLayer({
      id: 1,
      name: 'iso',
      width: 3,
      height: 4,
      tileWidth: 64,
      tileHeight: 32,
      tilesets: [],
      projection: p,
      offsetX: 7,
      offsetY: -9,
    });
    const map = new TileMap({ width: 3, height: 4, tileWidth: 64, tileHeight: 32, layers: [layer], projection: p });
    expect(map.tileToPixel(2, 1)).toEqual({ x: 160, y: 48 });
    expect(layer.tileToPixel(2, 1)).toEqual({ x: 167, y: 39 });
    expect(layer.pixelToTile(167, 39)).toEqual({ tx: 2, ty: 1 });
    expect([map.pixelWidth, map.pixelHeight, layer.pixelWidth, layer.pixelHeight]).toEqual([224, 112, 224, 112]);
  });

  it('preserves orthogonal defaults and non-square logical cells', () => {
    const p = new TileProjection({ tileWidth: 16, tileHeight: 24 });
    expect(p.tileToPixel(-2, 3)).toEqual({ x: -32, y: 72 });
    expect(p.logicalToPixel(7, -9)).toEqual({ x: 7, y: -9 });
    expect(p.pixelToTile(-0.01, 24)).toEqual({ tx: -1, ty: 1 });
  });
});
