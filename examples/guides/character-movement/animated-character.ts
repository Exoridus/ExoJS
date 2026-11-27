// #region guide:animated-character
import {
  ActionMap,
  AnimatedSprite,
  Application,
  AxisAction,
  ButtonAction,
  Color,
  GamepadButton,
  Graphics,
  Keyboard,
  Scene,
  SceneAvailability,
  Spritesheet,
  SystemOrder,
  Text,
} from '@codexo/exojs';
import {
  BoxShape,
  CapsuleShape,
  CharacterMovementComponent,
  KinematicMovementComponent,
  PhysicsBodyComponent,
  PhysicsWorld,
} from '@codexo/exojs/physics';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';

type Locomotion = 'idle' | 'walk' | 'jump';

class AnimatedCharacterScene extends Scene {
  private readonly controls = new ActionMap({
    walk: new AxisAction({ negative: Keyboard.A, positive: Keyboard.D }),
    jump: new ButtonAction([Keyboard.Space, GamepadButton.South]),
  });
  private visual!: AnimatedSprite;
  private character!: CharacterMovementComponent;

  override async load(): Promise<void> {
    const [texture, data] = await Promise.all([
      this.loader.load(assets.platformerCharactersImage),
      this.loader.load(assets.platformerCharactersAtlas),
    ]);
    const sheet = new Spritesheet(texture, data);

    this.track({ destroy: () => sheet.clear() });
    this.visual = new AnimatedSprite(texture, {
      idle: { frames: [sheet.getFrame('character_green_idle')] },
      walk: { frames: [sheet.getFrame('character_green_walk_a'), sheet.getFrame('character_green_walk_b')], fps: 8 },
      jump: { frames: [sheet.getFrame('character_green_jump')], repeat: 1 },
    })
      .setAnchor(0.5)
      .setScale(0.5)
      .setPosition(160, 220)
      .play('jump');
    this.track(this.visual);
  }

  override init(): void {
    const world = this.systems.add(new PhysicsWorld({ fixedDelta: this.app.fixedTimeStep }), { order: SystemOrder.Physics });
    const floor = new Graphics();

    floor.fillColor = new Color(90, 130, 165);
    floor.drawRectangle(-400, -16, 800, 32);
    floor.setPosition(400, 380);
    floor.addComponent(new PhysicsBodyComponent(world, { type: 'static', colliders: [{ shape: new BoxShape(800, 32) }] }));

    // At half scale the artwork spans about 41 x 49 pixels within its 64 x 64 frame.
    // This inset capsule is authored in world units; changing visual scale does not resize it.
    const physics = this.visual.addComponent(
      new PhysicsBodyComponent(world, {
        type: 'kinematic',
        colliders: [{ shape: new CapsuleShape(0, 2, 0, 14, 18), offset: { x: 0.25, y: 0 } }],
      }),
    );
    const movement = this.visual.addComponent(new KinematicMovementComponent(physics, { maxSpeed: 220 }));

    this.character = this.visual.addComponent(new CharacterMovementComponent(movement, { gravity: 1600 }));
    this.animations.add(this.visual, { when: SceneAvailability.Active });
    this.inputs.attach(this.controls);
    this.root.addChild(floor, this.visual);
    this.ui.addChild(new Text('Click the canvas. A/D: walk. Space / gamepad South: jump.', { fontSize: 18 }).setPosition(24, 24));
  }

  override fixedUpdate(): void {
    this.character.move(this.controls.walk.value);

    if (this.controls.jump.tick.pressed && this.character.grounded) {
      this.character.launch({ x: 0, y: -520 });
    }
  }

  override update(): void {
    // Airborne wins. Walk reflects input intent, even when a wall blocks movement.
    const requested: Locomotion = !this.character.grounded ? 'jump' : this.controls.walk.value === 0 ? 'idle' : 'walk';

    if (this.visual.currentClip !== requested) {
      this.visual.play(requested);
    }
  }
}

const app = new Application({
  scenes: { AnimatedCharacterScene },
  canvas: { width: 800, height: 450, mount: document.body, tabIndex: 0 },
  clearColor: new Color(24, 31, 42),
});

await app.start(AnimatedCharacterScene);
// #endregion guide:animated-character
