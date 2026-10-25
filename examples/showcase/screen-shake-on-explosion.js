// Auto-generated from screen-shake-on-explosion.ts - edit the .ts source, not this file.
import {
  ActionMap,
  Application,
  ButtonAction,
  Color,
  FixedResolutionCanvasSizing,
  Keyboard,
  Scene,
  SceneAvailability,
  Sprite,
  Spritesheet,
  Time,
  Vector,
  View,
} from '@codexo/exojs';
import { AlphaFadeOverLifetime, BurstSpawn, ConeDirection, Constant, particlesExtension, ParticleSystem } from '@codexo/exojs/particles';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { mountControls, startExample } from '@examples/runtime';
class ScreenShakeOnExplosionScene extends Scene {
  view;
  ps;
  burst;
  block;
  ground = [];
  hud;
  flash = new Color(255, 255, 255);
  burstPos = new Vector();
  flashTween = null;
  impacts = 0;
  scale = 1;
  centerY = 0;
  actions = new ActionMap({ impact: new ButtonAction(Keyboard.Space), reset: new ButtonAction(Keyboard.R) });
  onPointerDown = (_pointer, x, y) => this.impact(x, y);
  async load() {
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
    this.ground = Array.from({ length: 9 }, () =>
      this.track(new Sprite(texture).setTextureFrame(sheet.getFrame('terrain_grass_block_top')).setAnchor(0.5, 0)),
    );
  }
  init() {
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
      title: 'Impact Feedback',
      controls: [
        { keys: ['Click', 'Space'], action: 'burst + tint + shake' },
        { keys: 'R', action: 'reset' },
      ],
      status: 'Ready | Click anywhere',
    });
    this.inputs.attach(this.actions);
    this.app.input.onPointerDown.add(this.onPointerDown);
  }
  impact(x, y) {
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
  reset() {
    this.flashTween?.stop();
    this.flash.set(255, 255, 255, 1);
    this.ps.clearParticles();
    this.burst.config.schedule = [];
    this.view.clearShake();
    this.impacts = 0;
    this.hud.setStatus('Ready | Click anywhere');
  }
  update() {
    const { scale: k, contentHeight } = this.hud.fit(this.app, this.app.canvas);
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
    if (this.actions.reset.pressed) {
      this.reset();
    }
  }
  draw(context) {
    this.ground.forEach(tile => context.render(tile, { view: this.view }));
    context.render(this.block, { view: this.view });
    context.render(this.ps, { view: this.view });
  }
  destroy() {
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
