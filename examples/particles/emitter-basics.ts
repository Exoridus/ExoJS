import {
  Application,
  Color,
  FixedResolutionCanvasSizing,
  Keyboard,
  Rectangle,
  type RenderingContext,
  Scene,
  type Seconds,
  Sprite,
  type Texture,
} from '@codexo/exojs';
import {
  ColorGradient,
  ColorOverLifetime,
  ConeDirection,
  Constant,
  Curve,
  particlesExtension,
  ParticleSystem,
  RateSpawn,
  ScaleOverLifetime,
} from '@codexo/exojs/particles';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, slider } from '@examples/runtime';

const controls = {
  rate: slider('Rate / s', { min: 0, max: 250, step: 10, value: 100 }),
  lifetime: slider('Lifetime / s', { min: 0.2, max: 2.5, step: 0.1, value: 1.2 }),
  speed: slider('Speed / px/s', { min: 10, max: 180, step: 10, value: 80 }),
};
class EmitterBasicsScene extends Scene {
  private system!: ParticleSystem;
  private particleTexture!: Texture;
  private log!: Sprite;
  private spawn!: RateSpawn;
  private panel!: ReturnType<typeof demoPanel<typeof controls>>;
  private playing = true;
  private elapsed = 0;
  private dragging = false;
  private emitterX = 0.5;
  private emitterY = 0.85;
  private scale = 1;
  private width = 1280;
  private height = 600;

  override async load(): Promise<void> {
    this.particleTexture = await this.loader.load(assets.particleFlame);
  }

  override init(): void {
    this.system = new ParticleSystem(this.particleTexture, { capacity: 2000, simulation: 'cpu' });
    this.log = new Sprite(this.loader.get(assets.platformerTilesImage)).setTextureFrame(new Rectangle(585, 0, 64, 64)).setAnchor(0.5);
    this.root.addChild(this.log, this.system);
    this.system.addUpdateModule(
      new ScaleOverLifetime(
        new Curve([
          { t: 0, v: 0.015 },
          { t: 0.2, v: 0.04 },
          { t: 1, v: 0 },
        ]),
      ),
    );
    this.system.addUpdateModule(
      new ColorOverLifetime(
        new ColorGradient([
          { t: 0, color: new Color(255, 244, 200, 1) },
          { t: 0.35, color: new Color(255, 168, 64, 1) },
          { t: 0.75, color: new Color(220, 60, 40, 0.8) },
          { t: 1, color: new Color(120, 20, 20, 0) },
        ]),
      ),
    );
    this.panel = demoPanel({
      title: 'Control a Particle Emitter',
      layout: 'bar',
      controls,
      hint: 'Drag the flame and log. Size and color use elapsed / lifetime; displayed count follows rate and lifetime.',
      actions: {
        'Pause / Resume': () => {
          this.playing = !this.playing;
        },
        Reset: () => this.reset(),
      },
    });
    this.setSpawn();
    this.inputs.onTrigger(Keyboard.Space, () => {
      this.playing = !this.playing;
    });
    this.inputs.onTrigger(Keyboard.R, () => this.reset());
    this.app.input.onPointerDown.add(this.onDown);
    this.app.input.onPointerMove.add(this.onMove);
    this.app.input.onPointerUp.add(this.onUp);
  }

  private setSpawn(): void {
    const v = this.panel.values;
    this.system.clearSpawnModules();
    this.spawn = new RateSpawn({
      rate: new Constant(v.rate),
      lifetime: new Constant(v.lifetime),
      velocity: new ConeDirection(-Math.PI / 2, Math.PI / 12, v.speed * 0.7, v.speed),
    });
    this.system.addSpawnModule(this.spawn);
  }

  private reset(): void {
    this.elapsed = 0;
    this.emitterX = 0.5;
    this.emitterY = 0.85;
    this.panel.set('rate', 100);
    this.panel.set('lifetime', 1.2);
    this.panel.set('speed', 80);
    this.system.clearParticles();
    this.setSpawn();
  }

  private readonly onDown = (p: { x: number; y: number }): void => {
    this.dragging = true;
    this.onMove(p);
  };
  private readonly onMove = (p: { x: number; y: number }): void => {
    if (this.dragging) {
      this.emitterX = Math.max(0.1, Math.min(0.9, p.x / this.scale / this.width));
      this.emitterY = Math.max(0.2, Math.min(0.9, p.y / this.scale / this.height));
    }
  };
  private readonly onUp = (): void => {
    this.dragging = false;
  };

  override update(delta: Seconds): void {
    const v = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    this.scale = v.scale;
    this.width = v.width;
    this.height = v.contentHeight;
    this.root.setScale(v.scale);
    this.system.setPosition(v.width * this.emitterX, v.contentHeight * this.emitterY - 10);
    this.log.setPosition(v.width * this.emitterX, v.contentHeight * this.emitterY + 12).setScale(0.75, 0.45);
    const values = this.panel.values;
    (this.spawn.config.rate as Constant<number>).value = values.rate;
    (this.spawn.config.lifetime as Constant<number>).value = values.lifetime;
    const velocity = this.spawn.config.velocity as ConeDirection;
    velocity.minSpeed = values.speed * 0.7;
    velocity.maxSpeed = values.speed;

    // The scene owns simulation time so pause freezes existing particles as well as emission.
    if (this.playing) {
      this.elapsed += delta;
      this.system.update(delta);
    }

    this.panel.status(
      `${this.playing ? 'Running' : 'Paused'} | ${this.system.aliveCount} active | rate x lifetime ~ ${(values.rate * values.lifetime).toFixed(0)} steady-state particles`,
    );
  }

  override draw(context: RenderingContext): void {
    context.render(this.log);
    context.render(this.system);
  }

  override destroy(): void {
    this.app.input.onPointerDown.remove(this.onDown);
    this.app.input.onPointerMove.remove(this.onMove);
    this.app.input.onPointerUp.remove(this.onUp);
    this.panel.dispose();
    super.destroy();
  }
}

const app = new Application({
  scenes: { EmitterBasicsScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(20, 27, 34),
  extensions: [particlesExtension],
});
await app.start(EmitterBasicsScene);
