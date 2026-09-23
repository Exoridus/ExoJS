// Auto-generated from tiled-map-physics-actor.ts - edit the .ts source, not this file.
import { Application, Asset, Color, FixedResolutionCanvasSizing, Scene, Spritesheet, SystemOrder, Vector } from '@codexo/exojs';
import { BoxShape, PhysicsWorld } from '@codexo/exojs-physics';
import { PhysicsDebugDraw } from '@codexo/exojs-physics/debug';
import { tiledExtension, TileMapNode } from '@codexo/exojs-tiled';
import { buildObjectLayerColliders } from '@codexo/exojs-tilemap-physics';
import { mountControlPanel, mountControls } from '@examples/runtime';
class TiledMapPhysicsActorScene extends Scene {
  world;
  mapNode;
  actor;
  actorBody;
  debug;
  hud;
  panel;
  showOutlines = false;
  settled = 0;
  map;
  charactersTexture;
  spritesheetData;
  async load() {
    const [map, charactersTexture, spritesheetData] = await Promise.all([
      this.loader.load(Asset.type('tileMap', 'json/maps/physics-room.tmj')),
      this.loader.load(Asset.type('texture', assets.demo.spritesheets.platformerCharacters.image)),
      this.loader.load(Asset.type('json', assets.demo.spritesheets.platformerCharacters.data)),
    ]);
    this.map = map;
    this.charactersTexture = charactersTexture;
    this.spritesheetData = spritesheetData;
  }
  init() {
    this.world = new PhysicsWorld({ gravity: { x: 0, y: 1500 } });
    this.systems.add(this.world, { order: SystemOrder.Physics });
    this.mapNode = new TileMapNode(this.map);
    const collision = this.map.getObjectLayer('Collision');
    if (!collision) throw new Error('physics-room.tmj needs a Collision object layer.');
    const colliders = buildObjectLayerColliders(this.world, collision, { friction: 0.7, restitution: 0.05 });
    const characters = new Spritesheet(this.charactersTexture, this.spritesheetData);
    this.actor = characters.getFrameSprite('character_green_front').setAnchor(0.5);
    this.actorBody = this.world.attach(this.actor, {
      type: 'dynamic',
      position: { x: 320, y: 130 },
      shape: new BoxShape(48, 64),
      friction: 0.3,
      restitution: 0.25,
    });
    this.actorBody.applyImpulse(2600, 0);
    this.debug = new PhysicsDebugDraw(this.app, this.world, { drawShapes: true, drawCenters: true });
    this.hud = mountControls({
      title: 'Tiled Collision Map',
      controls: [{ keys: 'Panel', action: 'toggle authored collision outlines' }],
      status: `${colliders.length} static colliders from the loaded Tiled map`,
      hint: 'buildObjectLayerColliders() turns rectangles placed in the .tmj Collision layer into static physics bodies.',
    });
    this.panel = mountControlPanel({ title: 'Collision' });
    this.panel.addToggle({
      label: 'Show outlines',
      value: false,
      onChange: value => {
        this.showOutlines = value;
      },
    });
  }
  update(delta) {
    const body = this.actorBody;
    const speed = Math.hypot(body.linearVelocityX, body.linearVelocityY);
    this.settled = speed < 8 && body.y > 300 ? this.settled + delta : 0;
    if (this.settled < 1.2 && body.y < 900 && body.x > 0 && body.x < 1280) return;
    this.settled = 0;
    body.setTransform(new Vector(320, 130), 0);
    body.linearVelocityX = 0;
    body.linearVelocityY = 0;
    body.angularVelocity = 0;
    body.applyImpulse(2600, 0);
  }
  draw(context) {
    context.render(this.mapNode);
    context.render(this.actor);
    if (this.showOutlines) this.debug.render(context.backend);
  }
  destroy() {
    this.hud?.dispose();
    this.panel?.dispose();
    this.debug?.destroy();
    this.mapNode?.destroy();
    this.actor?.destroy();
    super.destroy();
  }
}
const app = new Application({
  scenes: { TiledMapPhysicsActorScene },
  canvas: { width: 1280, height: 704, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(38, 46, 66),
  extensions: [tiledExtension],
  loader: { basePath: 'assets/' },
});
await app.start(TiledMapPhysicsActorScene);
