// Auto-generated from tiled-isometric.ts - edit the .ts source, not this file.
import { Application, Asset, Color, Container, FixedResolutionCanvasSizing, Graphics, Scene } from '@codexo/exojs';
import { TileMapNode, TileProjection } from '@codexo/exojs/tilemap';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { tiledExtension } from '@codexo/exojs-tiled';
import { choice, demoPanel, startExample } from '@examples/runtime';
class IsometricScene extends Scene {
  map;
  worldRoot = new Container();
  selection = new Graphics();
  hexRoot = new Container();
  hexCells = new Graphics();
  hexSelection = new Graphics();
  hexProjection = new TileProjection({
    orientation: 'hexagonal',
    tileWidth: 64,
    tileHeight: 72,
    hexSideLength: 36,
    staggerAxis: 'y',
  });
  selectedTile = { tx: 3, ty: 3 };
  hexCell = { tx: 2, ty: 2 };
  hud;
  async load() {
    this.map = await this.loader.load(Asset.type('tileMap', assets.isometricLandscape.source));
  }
  init() {
    this.worldRoot.addChild(new TileMapNode(this.map), this.selection);
    this.hexRoot.addChild(this.hexCells, this.hexSelection);
    for (let ty = 0; ty < 7; ty++) {
      for (let tx = 0; tx < 7; tx++) {
        const corner = this.hexProjection.tileToPixel(tx, ty);
        this.hexCells.fillColor = new Color(tx % 3 === 0 ? 80 : 111, 151 + ty * 4, 114);
        this.hexCells.lineColor = new Color(39, 72, 57);
        this.hexCells.lineWidth = 2;
        this.hexCells.drawPolygon(this.hexOutline(corner.x, corner.y));
      }
    }
    this.hud = demoPanel({
      scene: this,
      layout: 'bar',
      controls: { projection: choice('Projection', ['isometric', 'hexagonal']) },
    });
    this.app.input.onPointerTap.add(this.onPoint);
    this.app.input.onPointerMove.add(this.onPoint);
  }
  hexOutline(x, y) {
    return [x + 32, y, x + 64, y + 18, x + 64, y + 54, x + 32, y + 72, x, y + 54, x, y + 18];
  }
  onPoint = pointer => {
    const hex = this.hud.values.projection === 'hexagonal';
    const root = hex ? this.hexRoot : this.worldRoot;
    const projection = hex ? this.hexProjection : this.map.projection;
    const { tx, ty } = projection.pixelToTile((pointer.x - root.x) / root.scale.x, (pointer.y - root.y) / root.scale.y);
    const size = hex ? 7 : 10;
    if (tx < 0 || ty < 0 || tx >= size || ty >= size) {
      return;
    }
    if (hex) {
      this.hexCell = { tx, ty };
    } else {
      this.selectedTile = { tx, ty };
    }
  };
  update() {
    const { scale: k, contentHeight } = this.hud.fit(this.app, this.app.canvas);
    const hex = this.hud.values.projection === 'hexagonal';
    const root = hex ? this.hexRoot : this.worldRoot;
    const projection = hex ? this.hexProjection : this.map.projection;
    const size = hex ? 7 : 10;
    const bounds = projection.getBounds(0, 0, size, size);
    const height = contentHeight * k;
    const scale = Math.min((this.app.width - 64 * k) / bounds.width, (height - 80 * k) / bounds.height);
    root
      .setScale(scale)
      .setPosition((this.app.width - bounds.width * scale) / 2 - bounds.x * scale, (height - bounds.height * scale) / 2 - bounds.y * scale);
    this.worldRoot.visible = !hex;
    this.hexRoot.visible = hex;
    const { tx, ty } = hex ? this.hexCell : this.selectedTile;
    const highlight = hex ? this.hexSelection : this.selection;
    highlight.clear();
    highlight.fillColor = new Color(255, 221, 120, 0.3);
    highlight.lineColor = new Color(255, 221, 120);
    highlight.lineWidth = (3 * k) / scale;
    if (hex) {
      const point = projection.tileToPixel(tx, ty);
      highlight.drawPolygon(this.hexOutline(point.x, point.y));
    } else {
      highlight.drawPolygon(
        [
          [tx, ty],
          [tx + 1, ty],
          [tx + 1, ty + 1],
          [tx, ty + 1],
        ].flatMap(([x, y]) => {
          const point = projection.tileToPixel(x, y);
          return [point.x, point.y];
        }),
      );
    }
    const pixel = projection.tileToPixel(tx, ty);
    this.hud.status(`Cell (${tx}, ${ty}) | display (${pixel.x}, ${pixel.y})`);
  }
  draw(context) {
    context.render(this.worldRoot);
    context.render(this.hexRoot);
  }
  destroy() {
    this.app.input.onPointerTap.remove(this.onPoint);
    this.app.input.onPointerMove.remove(this.onPoint);
    this.hexRoot.destroy();
    this.hud?.dispose();
    this.worldRoot.destroy();
    super.destroy();
  }
}
const app = new Application({
  scenes: { IsometricScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(30, 43, 57),
  extensions: [tiledExtension],
});
await startExample(app, () => app.start(IsometricScene));
