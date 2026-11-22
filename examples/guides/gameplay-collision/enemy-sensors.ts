// #region guide:enemy-sensors
import { ActionMap, Application, Color, Keyboard, Label, Scene, Sprite, SystemOrder, type Texture, VectorAction } from '@codexo/exojs';
import { CircleShape, type Collider, KinematicMovementComponent, PhysicsBodyComponent, PhysicsWorld } from '@codexo/exojs/physics';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';

const Layer = { player: 1 << 0, enemy: 1 << 1 } as const;

class EnemySensorScene extends Scene {
  private readonly controls = new ActionMap({
    move: new VectorAction({ left: Keyboard.A, right: Keyboard.D, up: Keyboard.W, down: Keyboard.S }),
  });
  private readonly enemies = new Map<Collider, { node: Sprite; damage: number }>();
  private playerTexture!: Texture;
  private enemyTexture!: Texture;
  private movement!: KinematicMovementComponent;
  private health = 3;

  override async load(): Promise<void> {
    [this.playerTexture, this.enemyTexture] = await Promise.all([
      this.loader.load(assets.physicsWoodBall),
      this.loader.load(assets.physicsMetalBall),
    ]);
  }

  override init(): void {
    const world = this.systems.add(new PhysicsWorld({ fixedDelta: this.app.fixedTimeStep }), { order: SystemOrder.Physics });
    const player = new Sprite(this.playerTexture).setAnchor(0.5).setPosition(150, 225);
    const physics = player.addComponent(
      new PhysicsBodyComponent(world, {
        type: 'kinematic',
        colliders: [{ shape: new CircleShape(this.playerTexture.width / 2), filter: { category: Layer.player, mask: Layer.enemy } }],
      }),
    );
    const status = new Label('Health: 3. Click the canvas and use WASD to touch the metal enemies.');

    this.movement = player.addComponent(new KinematicMovementComponent(physics, { maxSpeed: 220 }));
    this.inputs.attach(this.controls);
    this.root.addChild(player);
    status.anchorIn(this.ui, 'top-left', 24, 24);
    this.ui.addChild(status);

    // One dispatcher per world. Collider identity selects the gameplay object.
    world.onSensorEnter.add(event => {
      if (event.other.body !== physics.body) {
        return;
      }

      const enemy = this.enemies.get(event.sensor);

      if (enemy === undefined) {
        return;
      }

      this.health = Math.max(0, this.health - enemy.damage);
      status.text = `Health: ${this.health}. ${this.enemies.size - 1} enemies remain.`;
      // Remove gameplay state before destroying the component-owned collider.
      this.enemies.delete(event.sensor);
      enemy.node.destroy();
    });

    for (const y of [130, 225, 320]) {
      const enemy = new Sprite(this.enemyTexture).setAnchor(0.5).setPosition(570, y);
      const hitbox = enemy.addComponent(
        new PhysicsBodyComponent(world, {
          type: 'static',
          colliders: [
            {
              shape: new CircleShape(this.enemyTexture.width / 2),
              isSensor: true,
              filter: { category: Layer.enemy, mask: Layer.player },
            },
          ],
        }),
      );

      this.enemies.set(hitbox.body.colliders[0]!, { node: enemy, damage: 1 });
      this.root.addChild(enemy);
    }
  }

  override fixedUpdate(): void {
    this.movement.move(this.controls.move.value);
  }

  override destroy(): void {
    this.enemies.clear();
  }
}

const app = new Application({
  scenes: { EnemySensorScene },
  canvas: { width: 800, height: 450, mount: document.body, tabIndex: 0 },
  clearColor: new Color(24, 31, 42),
});

await app.start(EnemySensorScene);
// #endregion guide:enemy-sensors
