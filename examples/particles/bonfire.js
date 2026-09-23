// Auto-generated from bonfire.ts - edit the .ts source, not this file.
import { Application, BlendModes, Color, FixedResolutionCanvasSizing, Graphics, Scene } from '@codexo/exojs';
import {
  ApplyForce,
  ColorGradient,
  ColorOverLifetime,
  ConeDirection,
  Constant,
  particlesExtension,
  ParticleSystem,
  Range,
  RateSpawn,
  VectorRange,
} from '@codexo/exojs-particles';
import { mountControlPanel, mountControls } from '@examples/runtime';
class BonfireScene extends Scene {
  fireSystem;
  smokeSystem;
  ground = new Graphics();
  fireRate = new Constant(50);
  wind = new ApplyForce(0, 0);
  smokeWind = new ApplyForce(0, 0);
  panel;
  hud;
  init() {
    const app = this.app;
    const { width, height } = app;
    const centerX = width / 2;
    const fireY = height * 0.75;
    this.ground.fillColor = new Color(31, 42, 36);
    this.ground.drawRectangle(0, fireY + 75, width, height - fireY - 75);
    this.ground.fillColor = new Color(255, 143, 59, 0.18);
    this.ground.drawCircle(centerX, fireY + 25, 155);
    this.ground.fillColor = new Color(91, 90, 80);
    for (const x of [-125, -80, 80, 125]) {
      this.ground.drawCircle(centerX + x, fireY + 28, 25);
    }
    this.ground.fillColor = new Color(92, 54, 35);
    this.ground.drawPolygon([centerX - 110, fireY + 35, centerX - 98, fireY + 4, centerX + 105, fireY + 43, centerX + 95, fireY + 70]);
    this.ground.drawPolygon([centerX - 105, fireY + 45, centerX + 97, fireY + 5, centerX + 110, fireY + 35, centerX - 95, fireY + 72]);
    this.fireSystem = new ParticleSystem(this.loader.get(assets.demo.textures.particleFlame));
    this.systems.add(this.fireSystem);
    this.fireSystem.setPosition(width * 0.5, height * 0.75);
    this.fireSystem.setBlendMode(BlendModes.Additive);
    this.fireSystem.addSpawnModule(
      new RateSpawn({
        rate: this.fireRate,
        lifetime: new Range(0.6, 1.2),
        position: new VectorRange(-50, 50, -10, 10),
        velocity: new ConeDirection(-Math.PI / 2, Math.PI / 36, 60, 80),
      }),
    );
    this.fireSystem.addUpdateModule(
      new ColorOverLifetime(
        new ColorGradient([
          { t: 0, color: new Color(255, 218, 95, 1) },
          { t: 1, color: new Color(206, 53, 26, 0) },
        ]),
      ),
    );
    this.fireSystem.addUpdateModule(this.wind);
    this.smokeSystem = new ParticleSystem(this.loader.get(assets.demo.textures.particleSmoke));
    this.systems.add(this.smokeSystem);
    this.smokeSystem.setPosition(width * 0.5, height * 0.75 - 40);
    this.smokeSystem.setBlendMode(BlendModes.Normal);
    this.smokeSystem.addSpawnModule(
      new RateSpawn({
        rate: new Constant(8),
        lifetime: new Range(2.5, 4),
        position: new VectorRange(-30, 30, -5, 5),
        velocity: new ConeDirection(-Math.PI / 2, Math.PI / 12, 20, 35),
      }),
    );
    this.smokeSystem.addUpdateModule(
      new ColorOverLifetime(
        new ColorGradient([
          { t: 0, color: new Color(120, 100, 80, 0.4) },
          { t: 1, color: new Color(60, 55, 50, 0) },
        ]),
      ),
    );
    this.smokeSystem.addUpdateModule(this.smokeWind);
    this.hud = mountControls({
      title: 'Campfire',
      status: 'Flame and smoke respond to wind and intensity.',
      hint: 'The logs and stones give the particles a visible source.',
    });
    this.panel = mountControlPanel({ title: 'Campfire' });
    this.panel.addSlider({
      label: 'Intensity',
      min: 20,
      max: 100,
      step: 1,
      value: 50,
      onChange: value => {
        this.fireRate.value = value;
      },
    });
    this.panel.addSlider({
      label: 'Wind',
      min: -180,
      max: 180,
      step: 5,
      value: 0,
      onChange: value => {
        this.wind.accelerationX = value;
        this.smokeWind.accelerationX = value;
      },
    });
  }
  draw(context) {
    context.render(this.ground);
    context.render(this.smokeSystem);
    context.render(this.fireSystem);
  }
  destroy() {
    this.panel?.dispose();
    this.hud?.dispose();
    this.ground.destroy();
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
  clearColor: Color.black,
  extensions: [particlesExtension],
});
await app.start(BonfireScene);
