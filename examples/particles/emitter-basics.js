// Auto-generated from emitter-basics.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Scene } from '@codexo/exojs';
import {
  ApplyForce,
  ColorGradient,
  ColorOverLifetime,
  ConeDirection,
  Constant,
  Curve,
  particlesExtension,
  ParticleSystem,
  Range,
  RateSpawn,
  ScaleOverLifetime,
} from '@codexo/exojs/particles';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
class EmitterBasicsScene extends Scene {
  system;
  init() {
    const app = this.app;
    const { width, height } = app;
    this.system = new ParticleSystem(this.loader.get(assets.particleLight), { capacity: 4000 });
    this.systems.add(this.system);
    this.system.setPosition(width / 2, height - 80);
    // Rate, lifetime, and a cone-shaped velocity spread: a fountain that
    // shoots upward (-pi/2) with a +/-36 degree spread and 280-460 px/s speed.
    this.system.addSpawnModule(
      new RateSpawn({
        rate: new Constant(180),
        lifetime: new Range(0.6, 1.4),
        velocity: new ConeDirection(-Math.PI / 2, Math.PI / 5, 280, 460),
      }),
    );
    // Gravity pulls the fountain back down.
    this.system.addUpdateModule(new ApplyForce(0, 240));
    // Start/end size: each particle grows in fast, then shrinks to nothing
    // as it ages. ScaleOverLifetime sets the absolute scale every frame from
    // a curve sampled at elapsed / lifetime.
    this.system.addUpdateModule(
      new ScaleOverLifetime(
        new Curve([
          { t: 0, v: 0.04 },
          { t: 0.2, v: 0.09 },
          { t: 1, v: 0 },
        ]),
      ),
    );
    // Colour gradient over lifetime: white-hot core, then orange, then deep red, then
    // fading to transparent so particles dissolve at the end of their life.
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
  }
  draw(context) {
    context.render(this.system);
  }
}
const app = new Application({
  scenes: { EmitterBasicsScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
  extensions: [particlesExtension],
});
await app.start(EmitterBasicsScene);
