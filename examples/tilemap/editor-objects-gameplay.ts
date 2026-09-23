import { Application, Asset, Color, FixedResolutionCanvasSizing, Graphics, type RenderingContext, Scene, Text } from '@codexo/exojs';
import { tiledExtension, TileMapNode } from '@codexo/exojs-tiled';
import { type MapObjectDescriptor, MapObjectSpawner, type MapSpawnSession } from '@codexo/exojs-tilemap';
import { mountControls } from '@examples/runtime';

const makeMarker = (object: MapObjectDescriptor, color: Color): Graphics => {
  const marker = new Graphics();
  marker.position.set(object.x, object.y);
  marker.fillColor = color;
  marker.drawRoundedRectangle(0, 0, object.width, object.height, 10);
  return marker;
};

const contains = (object: MapObjectDescriptor, x: number, y: number): boolean =>
  x >= object.x && x <= object.x + object.width && y >= object.y && y <= object.y + object.height;

class EditorObjectsScene extends Scene {
  private mapNode!: TileMapNode;
  private spawns!: MapSpawnSession<Graphics>;
  private readonly objects = new Map<string, MapObjectDescriptor>();
  private readonly labels: Text[] = [];
  private hud!: ReturnType<typeof mountControls>;
  private doorOpen = false;
  private collected = false;

  override async load(): Promise<void> {
    const source = await this.loader.load(Asset.type('tiledSource', 'json/maps/harbor-plaza.tmj'));
    const map = source.toTileMap();
    this.mapNode = new TileMapNode(map);

    const spawn = (object: MapObjectDescriptor, color: Color): Graphics => {
      this.objects.set(object.kind!, object);
      const label = new Text(object.name.replace('-', ' '), { fillColor: Color.white, fontSize: 20 });
      label.setAnchor(0.5).setPosition(object.x + object.width / 2, object.y - 18);
      this.labels.push(label);
      return makeMarker(object, color);
    };
    const spawner = new MapObjectSpawner<void, Graphics>({
      Switch: object => spawn(object, new Color(255, 190, 65)),
      Door: object => spawn(object, new Color(225, 78, 83)),
      Collectible: object => spawn(object, new Color(75, 225, 241)),
    });
    this.spawns = await spawner.spawn(map, undefined);

    this.hud = mountControls({
      title: 'Editor Objects Become Gameplay',
      controls: [{ keys: 'Click', action: 'toggle the switch, then collect the gem' }],
      status: 'The authored switch controls the door. Open it to collect the gem.',
      hint: 'The three colored objects come from the Tiled object layer. MapObjectSpawner creates their runtime counterparts.',
    });
    this.app.input.onPointerTap.add(this.onTap);
  }

  private readonly onTap = (pointer: { x: number; y: number }): void => {
    const switchObject = this.objects.get('Switch');
    const gemObject = this.objects.get('Collectible');
    if (switchObject && contains(switchObject, pointer.x, pointer.y)) {
      this.doorOpen = !this.doorOpen;
      const doorObject = this.objects.get('Door');
      const door = doorObject && this.spawns.get(doorObject.id);
      if (door && doorObject) {
        door.clear();
        door.fillColor = this.doorOpen ? new Color(54, 167, 119, 0.35) : new Color(225, 78, 83);
        door.drawRoundedRectangle(0, 0, doorObject.width, doorObject.height, 10);
      }
      this.hud.setStatus(this.doorOpen ? 'Door open. Click the gem.' : 'Door closed. Click the switch to reopen it.');
    } else if (gemObject && contains(gemObject, pointer.x, pointer.y) && !this.collected) {
      if (!this.doorOpen) {
        this.hud.setStatus('The door blocks the gem. Click the switch first.');
        return;
      }
      this.collected = true;
      const gem = this.spawns.get(gemObject.id);
      if (gem) gem.visible = false;
      this.hud.setStatus(`Gem collected. Its runtime object came from authored map id ${gemObject.id}.`);
    }
  };

  override draw(context: RenderingContext): void {
    context.render(this.mapNode);
    for (const object of this.spawns.objects) context.render(object);
    for (const label of this.labels) context.render(label);
  }

  override destroy(): void {
    this.app.input.onPointerTap.remove(this.onTap);
    this.hud?.dispose();
    this.labels.forEach(label => label.destroy());
    this.spawns?.destroy();
    this.mapNode?.destroy();
    super.destroy();
  }
}

const app = new Application({
  scenes: { EditorObjectsScene },
  canvas: { width: 1280, height: 768, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(28, 36, 46),
  extensions: [tiledExtension],
  loader: { basePath: 'assets/' },
});

await app.start(EditorObjectsScene);
