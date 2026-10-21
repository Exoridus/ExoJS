// Auto-generated from bonfire.ts - edit the .ts source, not this file.
import { Application, BlendModes, Color, FixedResolutionCanvasSizing, Graphics, Scene, Sprite, Vector } from '@codexo/exojs';
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
  Turbulence,
  VectorRange,
} from '@codexo/exojs-particles';
import { mountControlPanel, mountControls } from '@examples/runtime';
class BonfireScene extends Scene {
  // Back to front: smoke behind the flames, embers in front.
  smoke;
  flames;
  core;
  embers;
  ground = new Graphics();
  glow;
  flameRate = new Constant(42);
  coreRate = new Constant(28);
  emberRate = new Constant(5);
  winds = [];
  intensity = 1;
  elapsed = 0;
  fireX = 0;
  fireY = 0;
  panel;
  hud;
  init() {
    const app = this.app;
    const { width, height } = app;
    const flame = this.loader.get(assets.demo.textures.particleFlame);
    const smoke = this.loader.get(assets.demo.textures.particleSmoke);
    const star = this.loader.get(assets.demo.textures.particleStar);
    this.fireX = width / 2;
    this.fireY = height * 0.74;
    this.drawGround(width, height);
    // Firelight on the ground: the soft light texture squashed into an
    // ellipse, so it has no hard edge.
    this.glow = new Sprite(this.loader.get(assets.demo.textures.particleLight))
      .setAnchor(0.5)
      .setBlendMode(BlendModes.Additive)
      .setPosition(this.fireX, this.fireY + 30);
    // Smoke: grey, normal blending, slow, grows and drifts as it rises.
    this.smoke = new ParticleSystem(smoke, { capacity: 256 });
    this.smoke.setPosition(this.fireX, this.fireY - 90);
    this.smoke.addSpawnModule(
      new RateSpawn({
        rate: new Constant(7),
        lifetime: new Range(3, 4.5),
        position: new VectorRange(-18, 18, -6, 6),
        velocity: new ConeDirection(-Math.PI / 2, Math.PI / 14, 30, 50),
        scale: new Constant(new Vector(0.22, 0.22)),
      }),
    );
    // ScaleOverLifetime sets the absolute scale, so every curve here is in texture scale units.
    this.smoke.addUpdateModule(
      new ScaleOverLifetime(
        new Curve([
          { t: 0, v: 0.12 },
          { t: 1, v: 0.45 },
        ]),
      ),
    );
    this.smoke.addUpdateModule(
      new ColorOverLifetime(
        new ColorGradient([
          { t: 0, color: new Color(90, 82, 76, 0) },
          { t: 0.2, color: new Color(90, 82, 76, 0.3) },
          { t: 1, color: new Color(50, 50, 55, 0) },
        ]),
      ),
    );
    this.smoke.addUpdateModule(new Turbulence(25, 0.012, 0.4));
    // Flames: the body of the fire. Additive, tapering as they rise and cool.
    this.flames = new ParticleSystem(flame, { capacity: 512 });
    this.flames.setPosition(this.fireX, this.fireY);
    this.flames.setBlendMode(BlendModes.Additive);
    this.flames.addSpawnModule(
      new RateSpawn({
        rate: this.flameRate,
        lifetime: new Range(0.7, 1.15),
        position: new VectorRange(-38, 38, -6, 6),
        velocity: new ConeDirection(-Math.PI / 2, Math.PI / 30, 70, 110),
        scale: new Constant(new Vector(0.26, 0.26)),
      }),
    );
    this.flames.addUpdateModule(
      new ScaleOverLifetime(
        new Curve([
          { t: 0, v: 0.14 },
          { t: 0.25, v: 0.24 },
          { t: 1, v: 0.07 },
        ]),
      ),
    );
    this.flames.addUpdateModule(
      new ColorOverLifetime(
        new ColorGradient([
          { t: 0, color: new Color(255, 190, 90, 0.9) },
          { t: 0.45, color: new Color(240, 100, 35, 0.55) },
          { t: 1, color: new Color(120, 25, 10, 0) },
        ]),
      ),
    );
    this.flames.addUpdateModule(new Turbulence(40, 0.02, 1.4));
    // Core: small, short-lived and nearly white where the fire is hottest.
    this.core = new ParticleSystem(flame, { capacity: 256 });
    this.core.setPosition(this.fireX, this.fireY + 4);
    this.core.setBlendMode(BlendModes.Additive);
    this.core.addSpawnModule(
      new RateSpawn({
        rate: this.coreRate,
        lifetime: new Range(0.35, 0.6),
        position: new VectorRange(-20, 20, -3, 3),
        velocity: new ConeDirection(-Math.PI / 2, Math.PI / 40, 50, 80),
        scale: new Constant(new Vector(0.15, 0.15)),
      }),
    );
    this.core.addUpdateModule(
      new ScaleOverLifetime(
        new Curve([
          { t: 0, v: 0.13 },
          { t: 1, v: 0.05 },
        ]),
      ),
    );
    this.core.addUpdateModule(
      new ColorOverLifetime(
        new ColorGradient([
          { t: 0, color: new Color(255, 245, 210, 0.9) },
          { t: 1, color: new Color(255, 170, 60, 0) },
        ]),
      ),
    );
    // Embers: a few sparks that escape the fire and wander upwards.
    this.embers = new ParticleSystem(star, { capacity: 128 });
    this.embers.setPosition(this.fireX, this.fireY - 10);
    this.embers.setBlendMode(BlendModes.Additive);
    this.embers.addSpawnModule(
      new RateSpawn({
        rate: this.emberRate,
        lifetime: new Range(1.4, 2.6),
        position: new VectorRange(-30, 30, -4, 4),
        velocity: new ConeDirection(-Math.PI / 2, Math.PI / 8, 90, 170),
        scale: new Constant(new Vector(0.022, 0.022)),
        tint: new Constant(new Color(255, 170, 70)),
      }),
    );
    this.embers.addUpdateModule(new Turbulence(70, 0.03, 1));
    this.embers.addUpdateModule(
      new ScaleOverLifetime(
        new Curve([
          { t: 0, v: 0.06 },
          { t: 1, v: 0.02 },
        ]),
      ),
    );
    for (const system of [this.smoke, this.flames, this.core, this.embers]) {
      const wind = new ApplyForce(0, 0);
      system.addUpdateModule(wind);
      this.winds.push(wind);
      this.systems.add(system);
    }
    this.hud = mountControls({
      title: 'Campfire',
      status: 'Four particle layers: smoke, flames, a hot core and embers.',
      hint: 'Each layer has its own texture, lifetime, size and colour curve. Wind pushes all of them.',
    });
    this.panel = mountControlPanel({ title: 'Fire controls' });
    this.panel.addSlider({
      label: 'Intensity',
      min: 0.3,
      max: 1.6,
      step: 0.05,
      value: 1,
      onChange: value => {
        this.intensity = value;
        this.flameRate.value = 42 * value;
        this.coreRate.value = 28 * value;
        this.emberRate.value = 5 * value * value;
      },
    });
    this.panel.addSlider({
      label: 'Wind',
      min: -180,
      max: 180,
      step: 5,
      value: 0,
      onChange: value => {
        // Light particles drift further than the dense flame body.
        this.winds[0].accelerationX = value * 0.8;
        this.winds[1].accelerationX = value * 0.5;
        this.winds[2].accelerationX = value * 0.3;
        this.winds[3].accelerationX = value;
      },
    });
  }
  drawGround(width, height) {
    const { fireX, fireY } = this;
    const g = this.ground;
    g.fillColor = new Color(22, 28, 26);
    g.drawRectangle(0, fireY + 30, width, height - fireY - 30);
    // Stone ring, then crossed logs at the base of the flames.
    g.fillColor = new Color(70, 70, 66);
    for (const x of [-120, -82, 82, 120]) {
      g.drawEllipse(fireX + x, fireY + 34, 22, 14);
    }
    g.fillColor = new Color(78, 46, 30);
    g.drawPolygon([fireX - 96, fireY + 22, fireX - 88, fireY + 4, fireX + 92, fireY + 30, fireX + 84, fireY + 46]);
    g.fillColor = new Color(96, 58, 36);
    g.drawPolygon([fireX - 92, fireY + 34, fireX + 86, fireY + 2, fireX + 96, fireY + 20, fireX - 84, fireY + 52]);
  }
  update(delta) {
    this.elapsed += delta;
  }
  draw(context) {
    // Light on the ground flickers with the fire instead of sitting as a disc.
    const flicker = 0.85 + Math.sin(this.elapsed * 13) * 0.06 + Math.sin(this.elapsed * 7.3) * 0.05;
    const strength = Math.min(1.2, this.intensity) * flicker;
    this.glow.setScale(0.75 * strength, 0.16 * strength);
    this.glow.setTint(new Color(255, 130, 50, 0.35 * strength));
    context.render(this.ground);
    context.render(this.glow);
    context.render(this.smoke);
    context.render(this.flames);
    context.render(this.core);
    context.render(this.embers);
  }
  destroy() {
    this.panel?.dispose();
    this.hud?.dispose();
    this.ground.destroy();
    this.glow.destroy();
    super.destroy();
  }
}
const app = new Application({
  scenes: { BonfireScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(8, 9, 14),
  extensions: [particlesExtension],
});
await app.start(BonfireScene);
