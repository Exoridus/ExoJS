import {
  ActionMap,
  Application,
  ButtonAction,
  Color,
  FixedResolutionCanvasSizing,
  Keyboard,
  PixelSnapMode,
  type RenderingContext,
  Scene,
  SceneAvailability,
  Sprite,
  Spritesheet,
  Time,
  type Tween,
  Vector,
  View,
} from '@codexo/exojs';
import { AlphaFadeOverLifetime, BurstSpawn, ConeDirection, Constant, particlesExtension, ParticleSystem } from '@codexo/exojs/particles';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { mountControls, startExample } from '@examples/runtime';

class ScreenShakeOnExplosionScene extends Scene {
  private view!: View;
  private ps!: ParticleSystem;
  private burst!: BurstSpawn;
  private block!: Sprite;
  private ground: Sprite[] = [];
  private hud!: ReturnType<typeof mountControls>;
  private readonly flash = new Color(255, 255, 255);
  private readonly burstPos = new Vector();
  private flashTween: Tween | null = null;
  private impacts = 0;
  private scale = 1;
  private centerY = 0;
  private readonly actions = new ActionMap({ impact: new ButtonAction(Keyboard.Space) });
  private readonly onPointerDown = (_pointer: unknown, x: number, y: number): void => this.impact(x, y);

  override async load(): Promise<void> {
    const [texture, data] = await Promise.all([
      this.loader.load(assets.platformerTilesImage),
      this.loader.load(assets.platformerTilesAtlas),
      this.loader.load(assets.particleSpark),
    ]);
    const sheet = new Spritesheet(texture, data);

    this.track({
      destroy: () => {
        sheet.clear();
      },
    });

    this.block = this.track(sheet.getFrameSprite('block_planks').setAnchor(0.5, 1));
    this.ground = Array.from({ length: 9 }, () => {
      const tile = this.track(new Sprite(texture).setTextureFrame(sheet.getFrame('terrain_grass_block_top')).setAnchor(0.5, 0));

      // Keep shared tile edges closed at fractional canvas scales and during camera shake.
      tile.pixelSnapMode = PixelSnapMode.Geometry;

      return tile;
    });
  }

  override init(): void {
    this.view = this.track(new View(this.app.width / 2, this.app.height / 2, this.app.width, this.app.height));
    this.ps = new ParticleSystem(this.loader.get(assets.particleSpark), { capacity: 256 });
    this.systems.add(this.ps);
    this.burst = new BurstSpawn({
      schedule: [],
      lifetime: new Constant(0.65),
      position: new Constant(this.burstPos),
      velocity: ConeDirection.omni(100, 360),
      scale: new Constant(new Vector(0.3, 0.3)),
    });
    this.ps.addSpawnModule(this.burst);
    this.ps.addUpdateModule(new AlphaFadeOverLifetime());
    this.hud = mountControls({
      theme: 'site',
      corner: 'bottom-left',
      controls: [{ keys: ['Click', 'Space'], action: 'burst + tint + shake' }],
    });
    this.inputs.attach(this.actions);
    this.app.input.onPointerDown.add(this.onPointerDown);
  }

  private impact(x: number, y: number): void {
    this.burstPos.set(x, y);
    this.burst.config.schedule = [{ time: 0, count: 80 }];
    this.burst.reset();
    this.view.shake(8 * this.scale, Time.seconds(0.28), { frequency: 26, decay: true });
    this.flashTween?.stop();
    this.flash.set(255, 100, 100, 1);
    this.flashTween = this.tweens.create(this.flash, { when: SceneAvailability.Active }).to({ r: 255, g: 255, b: 255 }, 0.25).start();
    this.impacts++;
    this.hud.setStatus(`Impact ${this.impacts} | Burst + tint + shake`);
  }

  override update(): void {
    const { scale: k, contentHeight } = this.hud.fit(this.app, this.app.canvas as HTMLCanvasElement);

    this.scale = k;
    this.centerY = Math.max(70, contentHeight * 0.6) * k;
    this.block
      .setPosition(this.app.width / 2, this.centerY)
      .setScale(Math.min(1.5, contentHeight / 160) * k)
      .setTint(this.flash);
    this.ground.forEach((tile, index) => tile.setPosition(this.app.width / 2 + (index - 4) * 64 * k, this.centerY).setScale(k));

    if (this.actions.impact.pressed) {
      this.impact(this.app.width / 2, this.centerY - 40 * k);
    }
  }

  override draw(context: RenderingContext): void {
    this.ground.forEach(tile => context.render(tile, { view: this.view }));
    context.render(this.block, { view: this.view });
    context.render(this.ps, { view: this.view });
  }

  override destroy(): void {
    this.app.input.onPointerDown.remove(this.onPointerDown);
    this.hud?.dispose();
    super.destroy();
  }
}

const app = new Application({
  scenes: { ScreenShakeOnExplosionScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(218, 237, 239),
  extensions: [particlesExtension],
});

await startExample(app, () => app.start(ScreenShakeOnExplosionScene));
