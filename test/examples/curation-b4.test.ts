// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

import { type Texture, TextureRegion } from '@codexo/exojs';
import { GridSpace, Pathfinder } from '@codexo/exojs/pathfinding';
import { BoxShape, PhysicsBody, PhysicsWorld } from '@codexo/exojs/physics';
import { refreshCell, TILE_TRANSFORM_IDENTITY, TileLayer, TileSet, WangSet } from '@codexo/exojs/tilemap';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const source = (slug: string) => readFileSync(resolve('examples', `${slug}.ts`), 'utf8');

describe('B4 world and physics contracts', () => {
  it('maps every four-neighbour mask independently and refreshes erased neighbours immediately', () => {
    const tileset = new TileSet({
      name: 'test',
      tileWidth: 64,
      tileHeight: 64,
      tileCount: 16,
      columns: 4,
      texture: new TextureRegion({ width: 256, height: 256 } as Texture, { x: 0, y: 0, width: 256, height: 256 }),
    });
    const wang = new WangSet({
      tilesetIndex: 0,
      type: 'edge',
      blobMap: Object.fromEntries(Array.from({ length: 16 }, (_, mask) => [mask, mask])),
    });
    const directions = [
      [0, -1, 1],
      [1, 0, 2],
      [0, 1, 4],
      [-1, 0, 8],
    ] as const;

    expect(source('tilemap/paint-autotiled-room')).toContain('blobMap: Object.fromEntries(MASK_TILES.map(mask => [mask, mask]))');

    for (let mask = 0; mask < 16; mask++) {
      const layer = new TileLayer({ id: 1, name: 'test', width: 3, height: 3, tileWidth: 64, tileHeight: 64, tilesets: [tileset] });
      const paint = (x: number, y: number) => layer.setTileAt(x, y, { tileset, localTileId: 15, transform: TILE_TRANSFORM_IDENTITY });

      paint(1, 1);
      directions.forEach(([x, y, bit]) => {
        if (mask & bit) {
          paint(1 + x, 1 + y);
        }
      });
      refreshCell(layer, 1, 1, wang, { wrapBorder: false });
      expect(layer.getTileAt(1, 1)?.localTileId, `mask ${mask}`).toBe(mask);
      layer.clearTileAt(1, 0);
      refreshCell(layer, 1, 0, wang, { wrapBorder: false });
      expect(layer.getTileAt(1, 1)?.localTileId, `erase north of ${mask}`).toBe(mask & ~1);
    }
  });

  it('draws the 16 reference tile edges and leaves fully connected corners seamless', () => {
    const prefix = source('tilemap/paint-autotiled-room')
      .split('class AutoTiledRoomScene')[0]!
      .replace(/^import[\s\S]*?;\s*/gm, '');
    const code = ts.transpileModule(prefix, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

    const makeCanvas = () => {
      const pixels = Array.from({ length: 64 }, () => Array<string>(64).fill(''));
      const context = {
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 0,
        fillRect(x: number, y: number, width: number, height: number) {
          for (let row = y; row < y + height; row++) {
            for (let column = x; column < x + width; column++) {
              pixels[row]![column] = this.fillStyle;
            }
          }
        },
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
      };

      return { width: 0, height: 0, pixels, getContext: () => context };
    };

    class Texture {
      constructor(public readonly canvas: ReturnType<typeof makeCanvas>) {}
    }
    const makeTile = runInNewContext(`${code}; makeTile;`, { document: { createElement: makeCanvas }, Texture }) as (
      mask: number,
    ) => Texture;

    for (let mask = 0; mask < 16; mask++) {
      const { pixels } = makeTile(mask).canvas;
      [
        [32, 0, 1],
        [63, 32, 2],
        [32, 63, 4],
        [0, 32, 8],
      ].forEach(([x, y, bit]) => {
        expect(pixels[y!]![x!], `mask ${mask}, edge ${bit}`).toBe(mask & bit! ? '#7ebd62' : '#d8c794');
      });
    }

    expect(makeTile(15).canvas.pixels[0]![0]).toBe('#7ebd62');
  });

  it('uses exact rotated collision picking where the former fixed hit box disagrees', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const body = world.add(
      new PhysicsBody({ position: { x: 200, y: 200 }, angle: Math.PI / 4, colliders: [{ shape: new BoxShape(70, 90) }] }),
    );
    const transform = (x: number, y: number) => ({ x: 200 + (x - y) / Math.sqrt(2), y: 200 + (x + y) / Math.sqrt(2) });
    const rotatedCorner = transform(30, -40);

    expect(Math.abs(rotatedCorner.x - body.x) > 42).toBe(true);
    expect(world.queryPoint(rotatedCorner).map(collider => collider.body)).toContain(body);
    expect(world.queryPoint(transform(36, 0))).toHaveLength(0);
    world.destroy();
  });

  it('retains JPS eligibility and fallback for weights, footprints and diagonal policies', () => {
    const pathfinder = new Pathfinder();
    const grid = GridSpace.from(8, 8, () => 1);

    expect(grid.pruning(1)).not.toBeNull();
    expect(grid.pruning(2)).toBeNull();
    grid.setCost(3, 3, 6);
    expect(grid.pruning(1)).toBeNull();
    const weighted = pathfinder.findPathBetween(grid, 0.5, 0.5, 6.5, 6.5, { pruning: true });
    const plain = pathfinder.findPathBetween(grid, 0.5, 0.5, 6.5, 6.5, { pruning: false });

    expect(weighted.cost).toBe(plain.cost);

    for (const diagonals of ['never', 'always'] as const) {
      expect(GridSpace.from(8, 8, () => 1, { diagonals }).pruning(1)).toBeNull();
    }

    const blocked = GridSpace.from(5, 5, x => (x === 2 ? 0 : 1));
    expect(pathfinder.findPathBetween(blocked, 0.5, 0.5, 4.5, 4.5).status).not.toBe('found');
  });

  it('owns navigation pointer listeners and immediate graphics through disposal', () => {
    const navigation = source('pathfinding/grid-navigation');

    expect(navigation).toContain('onPointerTap.add(this.onTap)');
    expect(navigation).toContain('onPointerTap.remove(this.onTap)');
    expect(navigation).toContain('this.terrain.destroy()');
    expect(navigation).toContain('this.overlay.destroy()');
    expect(navigation).toContain('this.panel?.dispose()');
    expect(source('tilemap/tiled-isometric')).toContain('this.body.wake()');
    expect(source('tilemap/worker-streamed-terrain')).toContain('destroy()');
    expect(source('tilemap/hexagonal-grid')).toContain('chunkWidth: 4');
  });
});
