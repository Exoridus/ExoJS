import {
  Application,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  Graphics,
  type Pointer,
  type RenderingContext,
  Scene,
  Texture,
  TextureRegion,
} from '@codexo/exojs';
import {
  TILE_TRANSFORM_IDENTITY,
  TileLayer,
  TileMap,
  tilemapExtension,
  TileMapNode,
  TileProjection,
  type TileProjectionOptions,
  TileSet,
} from '@codexo/exojs-tilemap';
import { mountControlPanel, mountControls } from '@examples/runtime';

// Staggered and hexagonal grids plus a collection-of-images tileset, all
// built in code - no map file and no image assets.
//
//   - TileProjection lays the cells out the way Tiled does: hexagons with
//     their straight sides along the stagger axis, or half-shifted diamonds.
//   - pixelToTile() picks the cell under the pointer, edges included.
//   - Every tile is its own texture: an image-collection TileSet. The trees
//     are taller than a cell, and the renderer draws row by row, so each tree
//     overlaps the row above it - across chunk borders too.

const COLUMNS = 14;
const ROWS = 10;

interface Layout {
  readonly name: string;
  readonly projection: TileProjectionOptions;
}

const layouts: readonly Layout[] = [
  {
    name: 'hexagonal, pointy',
    projection: { orientation: 'hexagonal', tileWidth: 56, tileHeight: 64, hexSideLength: 32, staggerAxis: 'y' },
  },
  { name: 'hexagonal, flat', projection: { orientation: 'hexagonal', tileWidth: 64, tileHeight: 56, hexSideLength: 32, staggerAxis: 'x' } },
  { name: 'staggered', projection: { orientation: 'staggered', tileWidth: 64, tileHeight: 32, staggerAxis: 'y' } },
];

const terrains = [
  { fill: '#6dbb58', edge: '#3f7d34' },
  { fill: '#4f9fd9', edge: '#2b6a9c' },
  { fill: '#e2c97a', edge: '#a88c3c' },
];
const TREE = terrains.length;
const TREE_HEIGHT = 44;

/** The outline of a cell of `projection`, relative to the top-left of its bounding box. */
const cellOutline = (projection: TileProjection): number[] => {
  const w = projection.tileWidth;
  const h = projection.tileHeight;
  const side = projection.hexSideLength;

  if (projection.staggerAxis === 'x') {
    const inset = (w - side) / 2;

    return [inset, 0, inset + side, 0, w, h / 2, inset + side, h, inset, h, 0, h / 2];
  }

  const inset = (h - side) / 2;

  return [w / 2, 0, w, inset, w, inset + side, w / 2, h, 0, inset + side, 0, inset];
};

/** Paints one tile image: a cell in the terrain colour, optionally with a tree rising above it. */
const paintTile = (projection: TileProjection, fill: string, edge: string, tree: boolean): Texture => {
  const lift = tree ? TREE_HEIGHT : 0;
  const canvas = document.createElement('canvas');

  canvas.width = projection.tileWidth;
  canvas.height = projection.tileHeight + lift;

  const context = canvas.getContext('2d')!;
  const outline = cellOutline(projection);

  context.beginPath();

  for (let i = 0; i < outline.length; i += 2) {
    context.lineTo(outline[i]!, outline[i + 1]! + lift);
  }

  context.closePath();
  context.fillStyle = fill;
  context.fill();
  context.lineWidth = 2;
  context.strokeStyle = edge;
  context.stroke();

  if (tree) {
    const x = canvas.width / 2;
    const ground = lift + projection.tileHeight / 2;

    context.fillStyle = '#6b4a2b';
    context.fillRect(x - 4, ground - 30, 8, 30);
    context.fillStyle = '#2f7a3a';
    context.beginPath();
    context.arc(x, ground - 38, 18, 0, Math.PI * 2);
    context.fill();
  }

  return new Texture(canvas);
};

class HexagonalGridScene extends Scene {
  private readonly worldRoot = new Container();
  private readonly highlight = new Graphics();
  private layoutIndex = 0;
  private map!: TileMap;
  private node!: TileMapNode;
  private textures: Texture[] = [];
  private hud!: ReturnType<typeof mountControls>;

  override init(): void {
    this.hud = mountControls({
      title: 'Hexagonal & Staggered Grids',
      controls: [
        { keys: 'Pointer', action: 'pick the cell under it' },
        { keys: 'panel', action: 'switch the grid layout' },
      ],
      status: 'Move the pointer over the map.',
      hint: 'Each tile is its own canvas texture in an image-collection TileSet; trees overhang the row above, as in Tiled.',
    });

    const panel = mountControlPanel({ title: 'Grid' });

    panel.addCycle({
      label: 'Layout',
      options: layouts.map(layout => layout.name),
      index: 0,
      onChange: index => this.build(index),
    });

    this.build(0);
    this.app.input.onPointerMove.add(this.onPointerMove);
  }

  private build(index: number): void {
    this.layoutIndex = index;
    this.node?.destroy();
    this.map?.destroy();

    for (const texture of this.textures) {
      texture.destroy();
    }

    const projection = new TileProjection(layouts[index]!.projection);

    this.textures = [
      ...terrains.map(({ fill, edge }) => paintTile(projection, fill, edge, false)),
      paintTile(projection, terrains[0]!.fill, terrains[0]!.edge, true),
    ];

    const props = new TileSet({
      name: 'terrain',
      tileWidth: projection.tileWidth,
      tileHeight: projection.tileHeight + TREE_HEIGHT,
      tileImages: this.textures.map(texture => new TextureRegion(texture, { x: 0, y: 0, width: texture.width, height: texture.height })),
    });
    // Small chunks so the overhang crosses chunk borders on screen.
    const ground = new TileLayer({
      id: 1,
      name: 'ground',
      width: COLUMNS,
      height: ROWS,
      tileWidth: projection.tileWidth,
      tileHeight: projection.tileHeight,
      chunkWidth: 4,
      chunkHeight: 4,
      tilesets: [props],
      projection,
    });

    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLUMNS; tx++) {
        // Deterministic terrain: a river through grass, a beach beside it, scattered trees.
        const river = Math.abs(tx - 6 - Math.round(Math.sin(ty * 0.7) * 2));
        let localTileId = river === 0 ? 1 : river === 1 ? 2 : 0;

        if (localTileId === 0 && (tx * 7 + ty * 11) % 5 === 0) {
          localTileId = TREE;
        }

        ground.setTileAt(tx, ty, { tileset: props, localTileId, transform: TILE_TRANSFORM_IDENTITY });
      }
    }

    this.map = new TileMap({
      width: COLUMNS,
      height: ROWS,
      tileWidth: projection.tileWidth,
      tileHeight: projection.tileHeight,
      tilesets: [props],
      layers: [ground],
      projection,
    });
    this.node = new TileMapNode(this.map);

    const width = this.map.pixelWidth ?? 0;
    const height = this.map.pixelHeight ?? 0;

    this.worldRoot.removeChildren();
    this.worldRoot.addChild(this.node, this.highlight);
    this.worldRoot.setPosition(Math.round((this.app.width - width) / 2), Math.round((this.app.height - height + TREE_HEIGHT) / 2));
    this.highlight.clear();
  }

  private readonly onPointerMove = (pointer: Pointer): void => {
    const projection = this.map.projection;
    const { tx, ty } = this.map.pixelToTile(pointer.x - this.worldRoot.x, pointer.y - this.worldRoot.y);

    this.highlight.clear();

    if (tx < 0 || ty < 0 || tx >= COLUMNS || ty >= ROWS) {
      this.hud.setStatus(`Outside the map - nearest cell (${tx}, ${ty}).`);

      return;
    }

    const corner = projection.tileToPixel(tx, ty);
    const outline = cellOutline(projection);

    this.highlight.fillColor = new Color(255, 234, 126, 0.3);
    this.highlight.lineColor = new Color(255, 234, 126);
    this.highlight.lineWidth = 3;
    this.highlight.drawPolygon(outline.map((value, i) => value + (i % 2 === 0 ? corner.x : corner.y)));

    const tile = this.map.getTileAt(1, tx, ty);
    const terrain = tile?.localTileId === TREE ? 'tree' : (['grass', 'water', 'sand'][tile?.localTileId ?? 0] ?? 'grass');

    this.hud.setStatus(`${layouts[this.layoutIndex]!.name}: cell (${tx}, ${ty}) - ${terrain}`);
  };

  override draw(context: RenderingContext): void {
    context.render(this.worldRoot);
  }

  override destroy(): void {
    this.app.input.onPointerMove.remove(this.onPointerMove);
    this.hud?.dispose();
    this.worldRoot.destroy();
    this.map?.destroy();

    for (const texture of this.textures) {
      texture.destroy();
    }

    super.destroy();
  }
}

const app = new Application({
  scenes: { HexagonalGridScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(24, 30, 38),
  extensions: [tilemapExtension],
});

await app.start(HexagonalGridScene);
