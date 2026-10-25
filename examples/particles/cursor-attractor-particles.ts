import {
  Application,
  Color,
  FixedResolutionCanvasSizing,
  Graphics,
  Keyboard,
  type RenderingContext,
  Scene,
  type Seconds,
  type Texture,
  Vector,
} from '@codexo/exojs';
import {
  AlphaFadeOverLifetime,
  AttractToPoint,
  ConeDirection,
  Constant,
  particlesExtension,
  ParticleSystem,
  RateSpawn,
  RepelFromPoint,
} from '@codexo/exojs/particles';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { choice, demoPanel, slider, startExample } from '@examples/runtime';

const controls = {
  mode: choice('Force', ['Attract', 'Repel']),
  strength: slider('Strength / px/s²', { min: 0, max: 1400, step: 50, value: 700 }),
};
class CursorAttractorParticlesScene extends Scene {
  private system!: ParticleSystem;
  private particleTexture!: Texture;
  private readonly attractor = new AttractToPoint(0, 0, 700, 120);
  private readonly repeller = new RepelFromPoint(0, 0, 0, 120);
  private readonly marks = new Graphics();
  private panel!: ReturnType<typeof demoPanel<typeof controls>>;
  private playing = true;
  private elapsed = 0;
  private targetX = 0.65;
  private targetY = 0.45;
  private scale = 1;
  private width = 1280;
  private height = 600;

  override async load(): Promise<void> {
    this.particleTexture = await this.loader.load(assets.particleLight);
  }

  override init(): void {
    this.system = new ParticleSystem(this.particleTexture, { capacity: 3000, simulation: 'cpu' });
    this.system.addSpawnModule(
      new RateSpawn({
        rate: new Constant(400),
        lifetime: new Constant(3),
        position: new Constant(new Vector(0, 0)),
        velocity: new ConeDirection(0, Math.PI, 15, 65),
        scale: new Constant(new Vector(0.05, 0.05)),
      }),
    );
    this.system.addUpdateModule(this.attractor);
    this.system.addUpdateModule(this.repeller);
    this.system.addUpdateModule(new AlphaFadeOverLifetime());
    this.root.addChild(this.system, this.marks);
    this.systems.add(this.system);
    this.panel = demoPanel({
      title: 'Attract and Repel Particles',
      layout: 'bar',
      controls,
      hint: 'Move pointer / arrows to place force. Click changes mode. Acceleration changes velocity over time.',
      actions: {
        'Pause / Resume': () => this.togglePlaying(),
        Reset: () => this.reset(),
      },
    });
    this.inputs.onTrigger(Keyboard.Space, () => this.togglePlaying());
    this.inputs.onTrigger(Keyboard.R, () => this.reset());
    this.inputs.onTrigger(Keyboard.Left, () => {
      this.targetX = Math.max(0, this.targetX - 0.05);
    });
    this.inputs.onTrigger(Keyboard.Right, () => {
      this.targetX = Math.min(1, this.targetX + 0.05);
    });
    this.inputs.onTrigger(Keyboard.Up, () => {
      this.targetY = Math.max(0, this.targetY - 0.05);
    });
    this.inputs.onTrigger(Keyboard.Down, () => {
      this.targetY = Math.min(1, this.targetY + 0.05);
    });
    this.app.input.onPointerMove.add(this.onMove);
    this.app.input.onPointerTap.add(this.onTap);
  }

  private reset(): void {
    this.elapsed = 0;
    this.targetX = 0.65;
    this.targetY = 0.45;
    this.system.clearParticles();
    this.panel.set('mode', 'Attract');
    this.panel.set('strength', 700);
  }

  private readonly onMove = (p: { x: number; y: number }): void => {
    this.targetX = Math.max(0, Math.min(1, p.x / this.scale / this.width));
    this.targetY = Math.max(0, Math.min(1, p.y / this.scale / this.height));
  };
  private readonly onTap = (): void => this.panel.step('mode');

  override update(delta: Seconds): void {
    const v = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    this.scale = v.scale;
    this.width = v.width;
    this.height = v.contentHeight;
    this.root.setScale(v.scale);
    this.system.setPosition(v.width / 2, v.contentHeight / 2);
    const x = this.targetX * v.width;
    const y = this.targetY * v.contentHeight;
    this.attractor.x = this.repeller.x = x - this.system.x;
    this.attractor.y = this.repeller.y = y - this.system.y;
    this.attractor.strength = this.panel.values.mode === 'Attract' ? this.panel.values.strength : 0;
    this.repeller.strength = this.panel.values.mode === 'Repel' ? this.panel.values.strength : 0;
    this.marks.clear();
    this.marks.fillColor = Color.transparent;
    this.marks.lineColor = new Color(184, 242, 100);
    this.marks.lineWidth = 2;
    this.marks.drawCircle(x, y, 120);
    this.marks.drawLine(x - 8, y, x + 8, y);
    this.marks.drawLine(x, y - 8, x, y + 8);

    if (this.playing) {
      this.elapsed += delta;
    }

    this.panel.status(
      `${this.panel.values.mode} | ${this.system.aliveCount} active | AttractToPoint falloff 120: acts beyond ring | RepelFromPoint radius 120: zero beyond ring`,
    );
  }

  override draw(context: RenderingContext): void {
    context.render(this.system);
    context.render(this.marks);
  }

  private togglePlaying(): void {
    this.playing = !this.playing;

    // Leaving the scene's system registry freezes emission and live particles alike.
    if (this.playing) {
      this.systems.add(this.system);
    } else {
      this.systems.remove(this.system);
    }
  }

  override destroy(): void {
    this.app.input.onPointerMove.remove(this.onMove);
    this.app.input.onPointerTap.remove(this.onTap);
    this.panel.dispose();
    super.destroy();
  }
}

const app = new Application({
  scenes: { CursorAttractorParticlesScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(20, 27, 34),
  extensions: [particlesExtension],
});
await startExample(app, () => app.start(CursorAttractorParticlesScene));
