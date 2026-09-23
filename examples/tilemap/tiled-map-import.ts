import { Application, Asset, Color, FixedResolutionCanvasSizing, Graphics, type RenderingContext, Scene, Text } from '@codexo/exojs';
import { tiledExtension, TileMapNode } from '@codexo/exojs-tiled';
import { ObjectKind, type TileMapObject } from '@codexo/exojs-tilemap';
import { mountControls } from '@examples/runtime';

const contains = (object: TileMapObject, x: number, y: number): boolean => {
  if (object.kind === ObjectKind.Point) return Math.hypot(x - object.x, y - object.y) <= 20;
  if (object.kind === ObjectKind.Ellipse) {
    const nx = (x - object.x - object.width / 2) / (object.width / 2);
    const ny = (y - object.y - object.height / 2) / (object.height / 2);
    return nx * nx + ny * ny <= 1;
  }
  return x >= object.x && x <= object.x + object.width && y >= object.y && y <= object.y + object.height;
};

class TiledMapImportScene extends Scene {
  private mapNode!: TileMapNode;
  private readonly overlay = new Graphics();
  private readonly labels: Text[] = [];
  private zones: TileMapObject[] = [];
  private selectedId: number | null = null;
  private hud!: ReturnType<typeof mountControls>;

  override async load(): Promise<void> {
    const map = await this.loader.load(Asset.type('tileMap', 'json/maps/harbor-plaza.tmj'));
    this.mapNode = new TileMapNode(map);
    this.zones = [...(map.getObjectLayer('Zones')?.objects ?? [])];

    for (const object of this.zones) {
      const label = new Text(object.name, { fillColor: new Color(31, 46, 50), fontSize: 19 });
      label.setAnchor(0.5).setPosition(object.x + object.width / 2, object.y + object.height / 2);
      this.labels.push(label);
    }
    this.redrawZones();
    this.hud = mountControls({
      title: 'Load a Tiled Map',
      controls: [{ keys: 'Click', action: 'inspect an authored object' }],
      status: `Loaded Harbor Plaza: ${this.zones.length} objects in the Zones layer.`,
      hint: 'The common tileMap asset type imports the .tmj and TileMapNode renders it. Object inspection is optional.',
    });
    this.app.input.onPointerTap.add(this.onTap);
  }

  private readonly onTap = (pointer: { x: number; y: number }): void => {
    const selected = [...this.zones].reverse().find(object => contains(object, pointer.x, pointer.y));
    this.selectedId = selected?.id ?? null;
    this.redrawZones();
    const properties = selected
      ? Object.entries(selected.properties)
          .map(([key, value]) => `${key}=${String(value)}`)
          .join(', ')
      : '';
    this.hud.setStatus(
      selected
        ? `${selected.name} (${selected.type || selected.kind})${properties ? ` - ${properties}` : ''}`
        : 'Click a highlighted zone to inspect its authored data.',
    );
  };

  private redrawZones(): void {
    this.overlay.clear();
    for (const object of this.zones) {
      const selected = object.id === this.selectedId;
      this.overlay.lineWidth = selected ? 6 : 3;
      this.overlay.lineColor = selected ? new Color(255, 191, 82) : new Color(48, 166, 184, 0.8);
      this.overlay.fillColor = selected ? new Color(255, 191, 82, 0.28) : new Color(48, 166, 184, 0.14);
      if (object.kind === ObjectKind.Point) this.overlay.drawCircle(object.x, object.y, selected ? 17 : 12);
      else if (object.kind === ObjectKind.Ellipse)
        this.overlay.drawEllipse(object.x + object.width / 2, object.y + object.height / 2, object.width / 2, object.height / 2);
      else this.overlay.drawRectangle(object.x, object.y, object.width, object.height);
    }
  }

  override draw(context: RenderingContext): void {
    context.render(this.mapNode);
    context.render(this.overlay);
    for (const label of this.labels) context.render(label);
  }

  override destroy(): void {
    this.app.input.onPointerTap.remove(this.onTap);
    this.hud?.dispose();
    this.labels.forEach(label => label.destroy());
    this.overlay.destroy();
    this.mapNode?.destroy();
    super.destroy();
  }
}

const app = new Application({
  scenes: { TiledMapImportScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(28, 36, 46),
  extensions: [tiledExtension],
  loader: { basePath: 'assets/' },
});

await app.start(TiledMapImportScene);
