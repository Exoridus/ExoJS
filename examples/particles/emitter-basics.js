// Auto-generated from emitter-basics.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Keyboard, Rectangle, Scene, Sprite } from '@codexo/exojs';
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
import { demoPanel, slider, startExample } from '@examples/runtime';
const controls = {
  rate: slider('Rate / s', { min: 0, max: 250, step: 10, value: 100 }),
  lifetime: slider('Lifetime / s', { min: 0.2, max: 2.5, step: 0.1, value: 1.2 }),
  speed: slider('Speed / px/s', { min: 10, max: 180, step: 10, value: 80 }),
};
class EmitterBasicsScene extends Scene {
  system;
  particleTexture;
  log;
  spawn;
  panel;
  playing = true;
  elapsed = 0;
  dragging = false;
  emitterX = 0.5;
  emitterY = 0.85;
  scale = 1;
  width = 1280;
  height = 600;
  async load() {
    this.particleTexture = await this.loader.load(assets.particleFlame);
  }
  init() {
    this.system = new ParticleSystem(this.particleTexture, { capacity: 2000, simulation: 'cpu' });
    this.log = new Sprite(this.loader.get(assets.platformerTilesImage)).setTextureFrame(new Rectangle(585, 0, 64, 64)).setAnchor(0.5);
    this.root.addChild(this.log, this.system);
    this.systems.add(this.system);
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
      scene: this,
      layout: 'bar',
      controls,
      actions: {
        'Pause / Resume': () => this.togglePlaying(),
      },
    });
    this.setSpawn();
    this.inputs.onTrigger(Keyboard.Space, () => this.togglePlaying());
    this.app.input.onPointerDown.add(this.onDown);
    this.app.input.onPointerMove.add(this.onMove);
    this.app.input.onPointerUp.add(this.onUp);
  }
  setSpawn() {
    const v = this.panel.values;
    this.system.clearSpawnModules();
    this.spawn = new RateSpawn({
      rate: new Constant(v.rate),
      lifetime: new Constant(v.lifetime),
      velocity: new ConeDirection(-Math.PI / 2, Math.PI / 12, v.speed * 0.7, v.speed),
    });
    this.system.addSpawnModule(this.spawn);
  }
  onDown = p => {
    this.dragging = true;
    this.onMove(p);
  };
  onMove = p => {
    if (this.dragging) {
      this.emitterX = Math.max(0.1, Math.min(0.9, p.x / this.scale / this.width));
      this.emitterY = Math.max(0.2, Math.min(0.9, p.y / this.scale / this.height));
    }
  };
  onUp = () => {
    this.dragging = false;
  };
  update(delta) {
    const v = this.panel.fit(this.app, this.app.canvas);
    this.scale = v.scale;
    this.width = v.width;
    this.height = v.contentHeight;
    this.root.setScale(v.scale);
    this.system.setPosition(v.width * this.emitterX, v.contentHeight * this.emitterY - 10);
    this.log.setPosition(v.width * this.emitterX, v.contentHeight * this.emitterY + 12).setScale(0.75, 0.45);
    const values = this.panel.values;
    this.spawn.config.rate.value = values.rate;
    this.spawn.config.lifetime.value = values.lifetime;
    const velocity = this.spawn.config.velocity;
    velocity.minSpeed = values.speed * 0.7;
    velocity.maxSpeed = values.speed;
    if (this.playing) {
      this.elapsed += delta;
    }
    this.panel.status(
      `${this.playing ? 'Running' : 'Paused'} | ${this.system.aliveCount} active | rate x lifetime ~ ${(values.rate * values.lifetime).toFixed(0)} steady-state particles`,
    );
  }
  draw(context) {
    context.render(this.log);
    context.render(this.system);
  }
  togglePlaying() {
    this.playing = !this.playing;
    // Leaving the scene's system registry freezes emission and live particles alike.
    if (this.playing) {
      this.systems.add(this.system);
    } else {
      this.systems.remove(this.system);
    }
  }
  destroy() {
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
await startExample(app, () => app.start(EmitterBasicsScene));
