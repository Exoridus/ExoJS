// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import { type Texture, TextureRegion } from '@codexo/exojs';
import { refreshCell, TILE_TRANSFORM_IDENTITY, TileLayer, TileMap, TileMapNode, TileSet, WangSet } from '@codexo/exojs/tilemap';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(`examples/${path}.ts`, 'utf8');
const evaluate = (code: string, context: Record<string, unknown> = {}) =>
  runInNewContext(
    ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText,
    context,
  );

const members = (code: string, names: string[]) => {
  const file = ts.createSourceFile('example.ts', code, ts.ScriptTarget.Latest, true);
  const result: string[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isClassDeclaration(node)) {
      for (const member of node.members) {
        if (member.name && names.includes(member.name.getText(file))) {
          result.push(member.getText(file).replace('private ', ''));
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(file);

  return result.join('\n');
};

describe('tile and character demonstrations', () => {
  it('loads a distinct catalog frame for each four-neighbour topology', () => {
    const prefix = source('tilemap/paint-autotiled-room')
      .split('class AutoTiledRoomScene')[0]!
      .replace(/^import[\s\S]*?;\s*/gm, '');
    const frames = evaluate(`${prefix}; TILE_FRAMES;`) as string[];
    const atlas = JSON.parse(readFileSync('examples/assets/images/platformer-tiles-atlas.json', 'utf8'));

    expect(frames).toHaveLength(16);
    expect(new Set(frames).size).toBe(16);

    for (const name of frames) {
      expect(atlas.frames[name]?.frame).toMatchObject({ w: 64, h: 64 });
    }

    expect(frames[0]).toBe('terrain_stone_block');
    expect(frames[5]).toBe('terrain_stone_vertical_middle');
    expect(frames[10]).toBe('terrain_stone_horizontal_middle');
    expect(frames[15]).toBe('terrain_stone_block_center');
  });

  it('populates the room before the view discovers its renderable chunks', () => {
    const tileset = new TileSet({
      name: 'room',
      tileWidth: 64,
      tileHeight: 64,
      tileCount: 16,
      columns: 4,
      texture: new TextureRegion({ width: 256, height: 256 } as Texture, { x: 0, y: 0, width: 256, height: 256 }),
    });
    const code = source('tilemap/paint-autotiled-room');
    const init = `${members(code, ['init']).split('this.ground.fillColor')[0]}}`;
    const fixture = evaluate(`class Room { ${init} ${members(code, ['reset'])} }; new Room();`, {
      TileLayer,
      TileMap,
      TileMapNode,
      refreshCell,
      TILE_TRANSFORM_IDENTITY,
      TILE: 64,
      WIDTH: 16,
      HEIGHT: 9,
      trackPressButtons: () => ({ dispose() {} }),
    });
    Object.assign(fixture, {
      tileset,
      app: { canvas: {} },
      wang: new WangSet({
        tilesetIndex: 0,
        type: 'edge',
        blobMap: Object.fromEntries(Array.from({ length: 16 }, (_, mask) => [mask, mask])),
      }),
    });
    fixture.init();
    expect(fixture.node.children[0].chunkNodes.length).toBeGreaterThan(0);
    fixture.node.destroy();
  });

  it('uses the original press button and repairs neighbouring masks after a quick right click', () => {
    const tileset = new TileSet({
      name: 'room',
      tileWidth: 64,
      tileHeight: 64,
      tileCount: 16,
      columns: 4,
      texture: new TextureRegion({ width: 256, height: 256 } as Texture, { x: 0, y: 0, width: 256, height: 256 }),
    });
    const layer = new TileLayer({ id: 1, name: 'room', width: 16, height: 9, tileWidth: 64, tileHeight: 64, tilesets: [tileset] });
    const wang = new WangSet({
      tilesetIndex: 0,
      type: 'edge',
      blobMap: Object.fromEntries(Array.from({ length: 16 }, (_, mask) => [mask, mask])),
    });
    const fixture = evaluate(
      `class Paint { ${members(source('tilemap/paint-autotiled-room'), ['paint', 'onDown', 'onMove', 'onEnd'])} }; new Paint();`,
      { refreshCell, TILE_TRANSFORM_IDENTITY, TILE: 64, WIDTH: 16, HEIGHT: 9 },
    );
    const buttons = [0, 0, 2, 1];
    Object.assign(fixture, {
      layer,
      tileset,
      wang,
      worldRoot: { x: 0, y: 0, scale: { x: 1, y: 1 } },
      pressButtons: { take: () => buttons.shift() },
    });
    fixture.onDown({ id: 7, x: 96, y: 96, buttons: 0 });
    fixture.onEnd();
    fixture.onDown({ id: 7, x: 160, y: 96, buttons: 0 });
    fixture.onEnd();
    expect(layer.getTileAt(1, 1)?.localTileId).toBe(2);
    expect(layer.getTileAt(2, 1)?.localTileId).toBe(8);
    fixture.onDown({ id: 7, x: 160, y: 96, buttons: 0 });
    fixture.onEnd();
    expect(layer.getTileAt(2, 1)).toBeNull();
    expect(layer.getTileAt(1, 1)?.localTileId).toBe(0);
    fixture.onDown({ id: 7, x: 96, y: 96, buttons: 0 });
    expect(layer.getTileAt(1, 1)?.localTileId).toBe(0);
    expect(fixture.painting).toBe(false);
  });

  it('covers short platforms and partial edge tiles without extending their colliders', () => {
    class Sprite {
      width = 64;
      height = 64;

      setTextureFrame(frame: unknown) {
        Object.assign(this, { frame });

        return this;
      }

      setPosition(x: number, y: number) {
        Object.assign(this, { x, y });

        return this;
      }
    }
    const fixture = evaluate(`class Platform { ${members(source('physics/character-movement'), ['addTiles'])} }; new Platform();`, {
      Sprite,
    });
    fixture.tiles = { texture: {}, getFrame: (name: string) => name };
    const tiles: Array<Sprite & { x: number; y: number }> = [];
    fixture.addTiles({ addChild: (tile: (typeof tiles)[number]) => tiles.push(tile) }, -70, -8, 140, 16, 'bridge_logs');
    expect(tiles.map(tile => [tile.x, tile.y, tile.width, tile.height])).toEqual([
      [-70, -8, 64, 16],
      [-6, -8, 64, 16],
      [58, -8, 12, 16],
    ]);
    expect(tiles.at(-1)!.x + tiles.at(-1)!.width).toBe(70);
  });
});
