import {
  ActionMap,
  Application,
  AudioBus,
  AudioGenerator,
  BlendModes,
  ButtonAction,
  Color,
  FixedResolutionCanvasSizing,
  type Gamepad,
  GamepadAxis,
  GamepadButton,
  Graphics,
  Keyboard,
  LowpassFilter,
  Random,
  type RenderingContext,
  Scene,
  type Seconds,
  Sprite,
  Text,
  Vector,
  VectorAction,
  type Voice,
} from '@codexo/exojs';
import {
  AlphaFadeOverLifetime,
  BurstSpawn,
  ColorGradient,
  ColorOverLifetime,
  ConeDirection,
  Constant,
  Curve,
  Drag,
  particlesExtension,
  ParticleSystem,
  Range,
  ScaleOverLifetime,
} from '@codexo/exojs/particles';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { mountControls } from '@examples/runtime';

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

interface Asteroid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  angle: number;
  spin: number;
  // Per-vertex radius factors give every rock its own silhouette.
  shape: number[];
}

const random = new Random(7);

class GamepadSpaceshipScene extends Scene {
  private ship!: Sprite;
  private velocity = new Vector(0, 0);
  private readonly actions = new ActionMap({
    move: new VectorAction([
      {
        up: [Keyboard.W, Keyboard.Up],
        down: [Keyboard.S, Keyboard.Down],
        left: [Keyboard.A, Keyboard.Left],
        right: [Keyboard.D, Keyboard.Right],
      },
      { x: GamepadAxis.LeftStickX, y: GamepadAxis.LeftStickY },
    ]),
    fire: new ButtonAction([Keyboard.Space, GamepadButton.RightTrigger]),
  });
  private facing = -Math.PI / 2;
  private thrust = 0;
  private engineBus!: AudioBus;
  private engineFilter!: LowpassFilter;
  private engine: Voice | null = null;
  private bullets: Bullet[] = [];
  private asteroids: Asteroid[] = [];
  private stars!: Graphics;
  private fx!: Graphics;
  private particles!: ParticleSystem;
  private burst!: BurstSpawn;
  private pad: Gamepad | null = null;
  private score = 0;
  private connectPrompt!: Text;
  private hud!: ReturnType<typeof mountControls>;

  override init(): void {
    const app = this.app;
    const { width, height } = app;

    this.stars = new Graphics();

    for (let i = 0; i < 160; i++) {
      const brightness = random.next(0.25, 0.9);

      this.stars.fillColor = new Color(200, 215, 255, brightness);
      this.stars.drawCircle(random.next(0, width), random.next(0, height), random.next(0.6, 1.8));
    }

    this.ship = new Sprite(this.loader.get(assets.ship))
      .setAnchor(0.5)
      .setScale(0.75)
      .setPosition(width / 2, height / 2);
    this.inputs.attach(this.actions);

    // A raw sawtooth is harsh; a low-pass on its own bus turns it into a
    // rumble, and opening the filter with thrust reads as the engine spooling up.
    this.engineBus = new AudioBus('engine', { parent: app.audio.sound });
    app.audio.registerBus(this.engineBus);
    this.engineFilter = new LowpassFilter({ frequency: 300, resonance: 1.5 });
    this.engineBus.addEffect(this.engineFilter);

    // An oscillator started while audio is still locked is dropped, so the
    // engine starts from the unlock gesture; onUnlock replays if audio is
    // already unlocked.
    app.audio.onUnlock.add(this.startEngine);

    this.fx = new Graphics();

    this.particles = new ParticleSystem(this.loader.get(assets.particleSpark), { capacity: 4000 });
    this.particles.setBlendMode(BlendModes.Additive);
    this.systems.add(this.particles);
    this.burst = new BurstSpawn({
      schedule: [{ time: 0, count: 70 }],
      lifetime: new Range(0.35, 0.8),
      position: new Constant(new Vector(0, 0)),
      velocity: ConeDirection.omni(80, 420),
      scale: new Constant(new Vector(0.08, 0.08)),
    });
    this.particles.addSpawnModule(this.burst);
    this.particles.addUpdateModule(new Drag(2.5));
    this.particles.addUpdateModule(
      new ColorOverLifetime(
        new ColorGradient([
          { t: 0, color: new Color(255, 250, 220, 1) },
          { t: 0.35, color: new Color(255, 170, 70, 1) },
          { t: 1, color: new Color(200, 60, 30, 1) },
        ]),
      ),
    );
    this.particles.addUpdateModule(
      new ScaleOverLifetime(
        new Curve([
          { t: 0, v: 0.08 },
          { t: 1, v: 0.02 },
        ]),
      ),
    );
    this.particles.addUpdateModule(new AlphaFadeOverLifetime());

    for (let i = 0; i < 5; i++) {
      this.asteroids.push(this.spawnAsteroid(width, height));
    }

    this.pad = app.input.getGamepad(0);
    this.connectPrompt = new Text('WASD / Arrows to fly  ·  Space to fire', {
      fillColor: new Color(200, 210, 235),
      fontSize: 22,
      align: 'center',
    })
      .setAnchor(0.5, 0.5)
      .setPosition(width / 2, height - 40);

    this.hud = mountControls({ status: 'Score: 0' });
  }

  private readonly startEngine = (): void => {
    this.engine ??= this.app.audio.play(new AudioGenerator({ type: 'sawtooth', frequency: 55 }), { bus: this.engineBus, volume: 0 });
  };

  private spawnAsteroid(width: number, height: number): Asteroid {
    const fromLeft = random.next() < 0.5;
    const radius = random.next(20, 38);

    return {
      x: fromLeft ? -40 : width + 40,
      y: random.next(0, height),
      vx: (fromLeft ? 1 : -1) * random.next(40, 100),
      vy: random.next(-40, 40),
      radius,
      angle: random.next(0, Math.PI * 2),
      spin: random.next(-0.8, 0.8),
      shape: Array.from({ length: 9 }, () => random.next(0.72, 1.05)),
    };
  }

  private fire(): void {
    this.bullets.push({
      x: this.ship.position.x + Math.cos(this.facing) * 30,
      y: this.ship.position.y + Math.sin(this.facing) * 30,
      vx: Math.cos(this.facing) * 680 + this.velocity.x,
      vy: Math.sin(this.facing) * 680 + this.velocity.y,
      life: 1.1,
    });

    if (this.pad?.canVibrate) {
      void this.pad.vibrate({ duration: 80, strongMagnitude: 0.15, weakMagnitude: 0.45 });
    }
  }

  private impact(x: number, y: number): void {
    this.particles.setPosition(x, y);
    this.burst.reset();
    this.score += 1;
    this.hud.setStatus(`Score: ${this.score}`);

    if (this.pad?.canVibrate) {
      void this.pad.vibrate({ duration: 160, strongMagnitude: 0.7, weakMagnitude: 0.4 });
    }
  }

  override update(delta: Seconds): void {
    const app = this.app;
    const { width, height } = app;

    const input = this.actions.move.value;
    const mag = Math.min(1, Math.hypot(input.x, input.y));

    if (this.actions.fire.pressed) {
      this.fire();
    }

    if (mag > 0.05) {
      this.facing = Math.atan2(input.y, input.x);
      this.ship.setRotation((this.facing * 180) / Math.PI + 90);
      this.velocity.x += Math.cos(this.facing) * mag * 420 * delta;
      this.velocity.y += Math.sin(this.facing) * mag * 420 * delta;
    }

    this.thrust += ((mag > 0.05 ? mag : 0) - this.thrust) * Math.min(1, delta * 10);

    if (this.engine) {
      this.engine.volume = this.thrust * 0.22;
      this.engineFilter.frequency = 300 + this.thrust * 900;
    }

    this.ship.move(this.velocity.x * delta, this.velocity.y * delta);
    const damping = Math.pow(0.985, delta * 60);
    this.velocity.x *= damping;
    this.velocity.y *= damping;
    this.wrap(this.ship.position, width, height, 32);

    for (const asteroid of this.asteroids) {
      asteroid.x += asteroid.vx * delta;
      asteroid.y += asteroid.vy * delta;
      asteroid.angle += asteroid.spin * delta;
      this.wrap(asteroid, width, height, asteroid.radius + 8);
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];

      bullet.x += bullet.vx * delta;
      bullet.y += bullet.vy * delta;
      bullet.life -= delta;

      if (bullet.life <= 0 || bullet.x < -20 || bullet.x > width + 20 || bullet.y < -20 || bullet.y > height + 20) {
        this.bullets.splice(i, 1);
        continue;
      }

      for (let a = 0; a < this.asteroids.length; a++) {
        const asteroid = this.asteroids[a];

        if (Math.hypot(bullet.x - asteroid.x, bullet.y - asteroid.y) < asteroid.radius) {
          this.impact(asteroid.x, asteroid.y);
          this.asteroids[a] = this.spawnAsteroid(width, height);
          this.bullets.splice(i, 1);
          break;
        }
      }
    }
  }

  private wrap(point: { x: number; y: number }, width: number, height: number, margin: number): void {
    if (point.x < -margin) {
      point.x = width + margin;
    } else if (point.x > width + margin) {
      point.x = -margin;
    }

    if (point.y < -margin) {
      point.y = height + margin;
    } else if (point.y > height + margin) {
      point.y = -margin;
    }
  }

  override draw(context: RenderingContext): void {
    const fx = this.fx.clear();

    fx.lineWidth = 2;
    fx.lineColor = new Color(150, 160, 180);
    fx.fillColor = new Color(70, 74, 88);

    for (const asteroid of this.asteroids) {
      const points: number[] = [];

      asteroid.shape.forEach((factor, index) => {
        const angle = asteroid.angle + (index / asteroid.shape.length) * Math.PI * 2;

        points.push(asteroid.x + Math.cos(angle) * asteroid.radius * factor, asteroid.y + Math.sin(angle) * asteroid.radius * factor);
      });
      fx.drawPolygon(points);
    }

    fx.lineWidth = 0;

    // Engine flame behind the ship, sized by the smoothed thrust.
    if (this.thrust > 0.05) {
      const back = this.facing + Math.PI;
      const flicker = 0.85 + Math.random() * 0.3;
      const length = (14 + this.thrust * 26) * flicker;
      const baseX = this.ship.position.x + Math.cos(back) * 20;
      const baseY = this.ship.position.y + Math.sin(back) * 20;
      const side = this.facing + Math.PI / 2;

      fx.fillColor = new Color(255, 150, 60, 0.85);
      fx.drawPolygon([
        baseX + Math.cos(side) * 7,
        baseY + Math.sin(side) * 7,
        baseX + Math.cos(back) * length,
        baseY + Math.sin(back) * length,
        baseX - Math.cos(side) * 7,
        baseY - Math.sin(side) * 7,
      ]);
      fx.fillColor = new Color(255, 240, 200, 0.9);
      fx.drawCircle(baseX, baseY, 4);
    }

    for (const bullet of this.bullets) {
      fx.fillColor = new Color(120, 230, 255, 0.35);
      fx.drawCircle(bullet.x, bullet.y, 7);
      fx.fillColor = new Color(220, 250, 255);
      fx.drawCircle(bullet.x, bullet.y, 3);
    }

    context.render(this.stars);
    context.render(this.fx);
    context.render(this.particles);
    context.render(this.ship);

    if (!this.app.input.gamepads.some(pad => pad.connected)) {
      context.render(this.connectPrompt);
    }
  }

  override destroy(): void {
    this.app.audio.onUnlock.remove(this.startEngine);
    this.engine?.stop();
    this.engineBus.removeEffect(this.engineFilter);
    this.engineFilter.destroy();
    this.app.audio.unregisterBus(this.engineBus);
    this.hud?.dispose();
    this.stars?.destroy();
    this.fx?.destroy();
    this.ship?.destroy();
    this.connectPrompt?.destroy();
    super.destroy();
  }
}

const app = new Application({
  scenes: { GamepadSpaceshipScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(6, 8, 16),
  extensions: [particlesExtension],
});

await app.start(GamepadSpaceshipScene);
