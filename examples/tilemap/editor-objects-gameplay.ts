import {
  ActionMap,
  Application,
  Asset,
  ButtonAction,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  GamepadButton,
  Graphics,
  Keyboard,
  type RenderingContext,
  Scene,
  Text,
} from '@codexo/exojs';
import { type MapObjectDescriptor, MapObjectSpawner, type MapSpawnSession } from '@codexo/exojs/tilemap';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { tiledExtension, TileMapNode } from '@codexo/exojs-tiled';
import { demoPanel, startExample } from '@examples/runtime';

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
  private hud!: ReturnType<typeof demoPanel>;
  private readonly worldRoot = new Container();
  private selected = 'Switch';
  private readonly actions = new ActionMap({
    next: new ButtonAction([Keyboard.Right, Keyboard.Tab, GamepadButton.DPadRight]),
    previous: new ButtonAction([Keyboard.Left, GamepadButton.DPadLeft]),
    confirm: new ButtonAction([Keyboard.Enter, Keyboard.Space, GamepadButton.South]),
  });
  private doorOpen = false;
  private collected = false;

  override async load(): Promise<void> {
    const source = await this.loader.load(Asset.type('tiledSource', assets.harborPlazaMap.source));
    const map = source.toTileMap();
    this.mapNode = new TileMapNode(map);

    const spawn = (object: MapObjectDescriptor, color: Color): Graphics => {
      this.objects.set(object.kind!, object);
      const label = new Text(object.name.replace('-', ' '), { fillColor: new Color(35, 63, 59), fontSize: 20 });
      label.setAnchor(0.5).setPosition(object.x + object.width / 2, object.y - 18);
      this.labels.push(label);

      return makeMarker(object, color);
    };

    const spawner = new MapObjectSpawner<void, Graphics>({
      Switch: object => spawn(object, new Color(136, 233, 126)),
      Door: object => spawn(object, new Color(225, 78, 83)),
      Collectible: object => spawn(object, new Color(75, 225, 241)),
    });
    this.spawns = await spawner.spawn(map, undefined);

    this.worldRoot.addChild(this.mapNode, ...this.spawns.objects, ...this.labels);
    this.hud = demoPanel({
      scene: this,
      layout: 'bar',
      controls: {},
    });
    this.inputs.attach(this.actions);
    this.app.input.onPointerMove.add(this.onHover);
    this.reset();
    this.app.input.onPointerTap.add(this.onTap);
  }

  private readonly onTap = (pointer: { x: number; y: number }): void => {
    const local = {
      x: (pointer.x - this.worldRoot.x) / this.worldRoot.scale.x,
      y: (pointer.y - this.worldRoot.y) / this.worldRoot.scale.y,
    };
    const switchObject = this.objects.get('Switch');
    const gemObject = this.objects.get('Collectible');

    if (switchObject && contains(switchObject, local.x, local.y)) {
      this.doorOpen = !this.doorOpen;
      const doorObject = this.objects.get('Door');
      const door = doorObject && this.spawns.get(doorObject.id);

      if (door && doorObject) {
        door.clear();
        door.fillColor = this.doorOpen ? new Color(54, 167, 119, 0.35) : new Color(225, 78, 83);
        door.drawRoundedRectangle(0, 0, doorObject.width, doorObject.height, 10);
      }

      this.hud.status(this.doorOpen ? 'Door open. Click the gem.' : 'Door closed. Click the switch to reopen it.');
    } else if (gemObject && contains(gemObject, local.x, local.y) && !this.collected) {
      if (!this.doorOpen) {
        this.hud.status('The door blocks the gem. Click the switch first.');

        return;
      }

      this.collected = true;
      const gem = this.spawns.get(gemObject.id);

      if (gem) {
        gem.visible = false;
      }

      this.hud.status(`Gem collected. Its runtime object came from authored map id ${gemObject.id}.`);
    }
  };

  private readonly onHover = (pointer: { x: number; y: number }): void => {
    const x = (pointer.x - this.worldRoot.x) / this.worldRoot.scale.x;
    const y = (pointer.y - this.worldRoot.y) / this.worldRoot.scale.y;
    const object = [...this.objects.values()].find(object => contains(object, x, y));

    if (object) {
      this.selected = object.kind!;
      this.hud.status(`${object.name} | authored id ${object.id} | ${object.kind}`);
    }
  };

  private reset(): void {
    this.doorOpen = false;
    this.collected = false;
    this.selected = 'Switch';
    const door = this.objects.get('Door')!;
    const marker = this.spawns.get(door.id)!;

    marker.clear();
    marker.fillColor = new Color(225, 78, 83);
    marker.drawRoundedRectangle(0, 0, door.width, door.height, 10);
    this.spawns.get(this.objects.get('Collectible')!.id)!.visible = true;
    this.hud.status('Switch selected | Enter activates. The door blocks the gem.');
  }

  override update(): void {
    const fit = this.hud.fit(this.app, this.app.canvas as HTMLCanvasElement);
    const scale = Math.min(this.app.width / 1280, (fit.contentHeight * fit.scale) / 768);

    this.worldRoot.setScale(scale).setPosition((this.app.width - 1280 * scale) / 2, 0);
    this.labels.forEach(label => {
      label.style.fontSize = (14 * fit.scale) / scale;
    });
    const kinds = ['Switch', 'Door', 'Collectible'];

    if (this.actions.next.pressed || this.actions.previous.pressed) {
      this.selected = kinds[(kinds.indexOf(this.selected) + (this.actions.next.pressed ? 1 : 2)) % kinds.length]!;
      const object = this.objects.get(this.selected)!;

      this.hud.status(`${object.name} selected | authored id ${object.id} | Enter activates`);
    }

    if (this.actions.confirm.pressed) {
      const object = this.objects.get(this.selected)!;

      this.onTap({
        x: this.worldRoot.x + (object.x + object.width / 2) * scale,
        y: this.worldRoot.y + (object.y + object.height / 2) * scale,
      });
    }
  }

  override draw(context: RenderingContext): void {
    context.render(this.worldRoot);
  }

  override destroy(): void {
    this.app.input.onPointerTap.remove(this.onTap);
    this.app.input.onPointerMove.remove(this.onHover);
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
});

await startExample(app, () => app.start(EditorObjectsScene));
