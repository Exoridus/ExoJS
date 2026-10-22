import {
  Application,
  Asset,
  Color,
  FixedResolutionCanvasSizing,
  type RenderingContext,
  Scene,
  type Seconds,
  type Sprite,
  Spritesheet,
  type SpritesheetData,
  SystemOrder,
  type Texture,
  Vector,
} from '@codexo/exojs';
import { PhysicsDebugDraw } from '@codexo/exojs/debug';
import { BoxShape, type PhysicsBody, PhysicsWorld } from '@codexo/exojs/physics';
import type { TileMap } from '@codexo/exojs/tilemap';
import { buildObjectLayerColliders } from '@codexo/exojs/tilemap-physics';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { tiledExtension, TileMapNode } from '@codexo/exojs-tiled';
import { demoPanel, toggle } from '@examples/runtime';

class TiledMapPhysicsActorScene extends Scene {
  private world!: PhysicsWorld;
  private mapNode!: TileMapNode;
  private actor!: Sprite;
  private actorBody!: PhysicsBody;
  private debug!: PhysicsDebugDraw;
  private panel!: ReturnType<typeof demoPanel>;
  private showOutlines = false;
  private settled = 0;
  private map!: TileMap;
  private charactersTexture!: Texture;
  private spritesheetData!: SpritesheetData;

  override async load(): Promise<void> {
    const [map, charactersTexture, spritesheetData] = await Promise.all([
      this.loader.load(Asset.type('tileMap', assets.physicsRoomMap.source)),
      this.loader.load(assets.platformerCharactersImage),
      this.loader.load(assets.platformerCharactersAtlas),
    ]);
    this.map = map;
    this.charactersTexture = charactersTexture;
    this.spritesheetData = spritesheetData as SpritesheetData;
  }

  override init(): void {
    this.world = new PhysicsWorld({ gravity: { x: 0, y: 1500 }, fixedDelta: this.app.fixedTimeStep });
    this.systems.add(this.world, { order: SystemOrder.Physics });
    this.mapNode = new TileMapNode(this.map);

    const collision = this.map.getObjectLayer('Collision');

    if (!collision) {
      throw new Error('physics-room.tmj needs a Collision object layer.');
    }

    buildObjectLayerColliders(this.world, collision, { friction: 0.7, restitution: 0.05 });

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
    this.panel = demoPanel({
      title: 'Collision',
      controls: { outlines: toggle('Show outlines', false) },
      onChange: (_key, value) => {
        this.showOutlines = value;
      },
    });
  }

  override update(delta: Seconds): void {
    const body = this.actorBody;
    const speed = Math.hypot(body.linearVelocityX, body.linearVelocityY);
    this.settled = speed < 8 && body.y > 300 ? this.settled + delta : 0;

    if (this.settled < 1.2 && body.y < 900 && body.x > 0 && body.x < 1280) {
      return;
    }

    this.settled = 0;
    body.setTransform(new Vector(320, 130), 0);
    body.linearVelocityX = 0;
    body.linearVelocityY = 0;
    body.angularVelocity = 0;
    body.applyImpulse(2600, 0);
  }

  override draw(context: RenderingContext): void {
    context.render(this.mapNode);
    context.render(this.actor);

    if (this.showOutlines) {
      this.debug.render(context.backend);
    }
  }

  override destroy(): void {
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
});

await app.start(TiledMapPhysicsActorScene);
