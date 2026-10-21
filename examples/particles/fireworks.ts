import {
  Application,
  BlendModes,
  Color,
  FixedResolutionCanvasSizing,
  Graphics,
  Random,
  type RenderingContext,
  Scene,
  type Seconds,
  Size,
  Sprite,
  type Texture,
  Time,
  Timer,
  Vector,
} from '@codexo/exojs';
import {
  AlphaFadeOverLifetime,
  ApplyForce,
  BurstSpawn,
  ConeDirection,
  Constant,
  Curve,
  Drag,
  particlesExtension,
  ParticleSystem,
  type ParticleSystemOptions,
  Range,
  ScaleOverLifetime,
  Turbulence,
  VectorRange,
} from '@codexo/exojs/particles';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { mountControls } from '@examples/runtime';

const random = new Random(2026);
const autoLaunchInterval = Time.seconds(1.6);
// Upward launch speed range (px/s, negative = up). Higher = higher apex.
const launchSpeedMin = 420;
const launchSpeedMax = 560;
const rocketGravity = 260;
const trailLength = 10;
const fireworkColors = [
  new Color(255, 120, 110),
  new Color(255, 200, 90),
  new Color(120, 220, 255),
  new Color(160, 255, 150),
  new Color(255, 140, 230),
  new Color(190, 160, 255),
];

/** A rising firework shell. Detonates once its upward motion turns over (apex). */
interface Rocket {
  sprite: Sprite;
  position: Vector;
  velocityY: number;
  color: Color;
  trail: number[];
}

/**
 * One layer of the explosion: its own texture, motion and fade. Every layer
 * bursts from the same point, so the effect reads as a single event while each
 * layer keeps a separate role.
 */
const createLayer = (texture: Texture, burst: BurstSpawn, options: ParticleSystemOptions): ParticleSystem => {
  const system = new ParticleSystem(texture, options);

  system.setBlendMode(BlendModes.Additive);
  system.addSpawnModule(burst);

  return system;
};

class FireworksScene extends Scene {
  private canvasSize!: Size;
  // A burst schedule also fires once when its system starts; park the burst
  // point off-screen until the first rocket detonates.
  private burstPosition = new Vector(-1000, -1000);
  private flashBurst!: BurstSpawn;
  private sparkBurst!: BurstSpawn;
  private emberBurst!: BurstSpawn;
  private layers: ParticleSystem[] = [];
  private trails = new Graphics();
  private autoLaunchTimer!: Timer;
  private rocketTexture!: Texture;
  private rockets: Rocket[] = [];
  private launchCount = 0;
  private hud!: ReturnType<typeof mountControls>;

  override init(): void {
    const app = this.app;
    const { width, height } = app;
    const star = this.loader.get(assets.particleStar);
    const light = this.loader.get(assets.particleLight);

    this.canvasSize = new Size(width, height);
    this.rocketTexture = star;

    // 1. Flash: one large, very short-lived glow that sells the detonation.
    this.flashBurst = new BurstSpawn({
      schedule: [{ time: 0, count: 1 }],
      lifetime: new Constant(0.22),
      position: new Constant(this.burstPosition),
      velocity: new VectorRange(0, 0, 0, 0),
      scale: new Constant(new Vector(0.55, 0.55)),
      tint: new Constant(Color.white),
    });
    const flash = createLayer(light, this.flashBurst, { capacity: 32 });
    // ScaleOverLifetime sets the absolute scale, so the curve is in texture scale units.
    flash.addUpdateModule(
      new ScaleOverLifetime(
        new Curve([
          { t: 0, v: 0.3 },
          { t: 1, v: 0.75 },
        ]),
      ),
    );
    flash.addUpdateModule(
      new AlphaFadeOverLifetime(
        new Curve([
          { t: 0, v: 0.9 },
          { t: 1, v: 0 },
        ]),
      ),
    );

    // 2. Sparks: fast glints that brake against the air and fall.
    this.sparkBurst = new BurstSpawn({
      schedule: [{ time: 0, count: 180 }],
      lifetime: new Range(1.1, 1.8),
      position: new Constant(this.burstPosition),
      // A narrow speed band puts the sparks on one expanding shell.
      velocity: ConeDirection.omni(200, 320),
      scale: new Constant(new Vector(0.1, 0.1)),
      tint: new Constant(fireworkColors[0]),
    });
    const sparks = createLayer(star, this.sparkBurst, { capacity: 4096 });
    sparks.addUpdateModule(new Drag(1.3));
    sparks.addUpdateModule(new ApplyForce(0, 70));
    sparks.addUpdateModule(
      new ScaleOverLifetime(
        new Curve([
          { t: 0, v: 0.12 },
          { t: 1, v: 0.04 },
        ]),
      ),
    );
    sparks.addUpdateModule(
      new AlphaFadeOverLifetime(
        new Curve([
          { t: 0, v: 1 },
          { t: 0.55, v: 0.85 },
          { t: 1, v: 0 },
        ]),
      ),
    );

    // 3. Afterglow: a few slow, warm embers that linger after the sparks are gone.
    this.emberBurst = new BurstSpawn({
      schedule: [{ time: 0, count: 40 }],
      lifetime: new Range(2.2, 3.2),
      position: new Constant(this.burstPosition),
      velocity: ConeDirection.omni(15, 80),
      scale: new Constant(new Vector(0.06, 0.06)),
      tint: new Constant(new Color(255, 214, 150)),
    });
    const embers = createLayer(star, this.emberBurst, { capacity: 1024 });
    embers.addUpdateModule(new Drag(0.9));
    embers.addUpdateModule(new ApplyForce(0, 28));
    embers.addUpdateModule(new Turbulence(18, 0.02, 0.6));
    embers.addUpdateModule(
      new AlphaFadeOverLifetime(
        new Curve([
          { t: 0, v: 0 },
          { t: 0.15, v: 0.9 },
          { t: 1, v: 0 },
        ]),
      ),
    );

    // Drawn back to front: embers under sparks under the flash.
    this.layers = [embers, sparks, flash];

    for (const layer of this.layers) {
      this.systems.add(layer);
    }

    // Click anywhere to launch a rocket from the bottom at that x.
    app.input.onPointerDown.add(this.onPointerDown);

    // Ambient fallback: keep the sky alive even without clicks.
    this.autoLaunchTimer = new Timer(autoLaunchInterval, true);

    this.hud = mountControls({
      title: 'Fireworks',
      controls: [{ keys: 'Click', action: 'launch a rocket' }],
      status: 'Launched: 0 · in flight: 0',
      hint: 'Three layers per burst: a short flash, sparks that brake and fall, and slow embers that linger.',
    });

    this.launchRocket(width * 0.5);
  }

  // Application input outlives the scene, so the handler is removed in destroy().
  private readonly onPointerDown = (_pointer: unknown, x: number): void => this.launchRocket(x);

  private launchRocket(x: number): void {
    const color = fireworkColors[Math.floor(random.next(0, fireworkColors.length)) % fireworkColors.length];
    const sprite = new Sprite(this.rocketTexture);

    sprite.setAnchor(0.5).setBlendMode(BlendModes.Additive).setTint(color).setScale(0.09);

    const position = new Vector(x, this.canvasSize.height + 10);

    sprite.setPosition(position.x, position.y);

    this.rockets.push({
      sprite,
      position,
      velocityY: -random.next(launchSpeedMin, launchSpeedMax),
      color,
      trail: [],
    });

    this.launchCount++;
    this.updateStatus();
  }

  private detonate(rocket: Rocket): void {
    this.burstPosition.set(rocket.position.x, rocket.position.y);
    this.sparkBurst.config.tint = new Constant(rocket.color);
    this.flashBurst.config.tint = new Constant(
      new Color(Math.round(128 + rocket.color.r / 2), Math.round(128 + rocket.color.g / 2), Math.round(128 + rocket.color.b / 2)),
    );
    this.flashBurst.reset();
    this.sparkBurst.reset();
    this.emberBurst.reset();
  }

  private updateStatus(): void {
    this.hud.setStatus(`Launched: ${this.launchCount} · in flight: ${this.rockets.length}`);
  }

  override update(delta: Seconds): void {
    if (this.autoLaunchTimer.expired) {
      this.launchRocket(random.next(120, this.canvasSize.width - 120));
      this.autoLaunchTimer.restart();
    }

    // Integrate rockets; detonate the instant a rocket's upward velocity
    // turns over (its apex), then retire it.
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const rocket = this.rockets[i];

      rocket.velocityY += rocketGravity * delta;
      rocket.position.y += rocket.velocityY * delta;
      rocket.sprite.setPosition(rocket.position.x, rocket.position.y);
      rocket.trail.push(rocket.position.x, rocket.position.y);

      if (rocket.trail.length > trailLength * 2) {
        rocket.trail.splice(0, 2);
      }

      if (rocket.velocityY >= 0 || rocket.position.y <= 40) {
        this.detonate(rocket);
        rocket.sprite.destroy();
        this.rockets.splice(i, 1);
        this.updateStatus();
      }
    }
  }

  override draw(context: RenderingContext): void {
    // Each rocket leaves a short fading streak; older segments are fainter.
    const trails = this.trails.clear();

    trails.lineWidth = 2;

    for (const rocket of this.rockets) {
      const points = rocket.trail.length / 2;

      for (let i = 1; i < points; i++) {
        const alpha = (i / points) * 0.7;

        trails.lineColor = new Color(rocket.color.r, rocket.color.g, rocket.color.b, alpha);
        trails.drawLine(rocket.trail[(i - 1) * 2], rocket.trail[(i - 1) * 2 + 1], rocket.trail[i * 2], rocket.trail[i * 2 + 1]);
      }
    }

    context.render(trails);

    for (const layer of this.layers) {
      context.render(layer);
    }

    for (const rocket of this.rockets) {
      context.render(rocket.sprite);
    }
  }

  override destroy(): void {
    this.app.input.onPointerDown.remove(this.onPointerDown);
    this.hud.dispose();
    this.trails.destroy();

    for (const rocket of this.rockets) {
      rocket.sprite.destroy();
    }

    super.destroy();
  }
}

const app = new Application({
  scenes: { FireworksScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(4, 6, 14),
  extensions: [particlesExtension],
});

await app.start(FireworksScene);
