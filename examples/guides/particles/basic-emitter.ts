// #region guide:basic-emitter
import { Application, Color, type RenderingContext, Scene } from '@codexo/exojs';
import { ApplyForce, ConeDirection, Constant, Curve, particlesExtension, ParticleSystem, RateSpawn, ScaleOverLifetime } from '@codexo/exojs-particles';

class FountainScene extends Scene {
  private particles!: ParticleSystem;

  override init(): void {
    this.particles = new ParticleSystem({ capacity: 512 });
    this.particles.setPosition(this.app.width / 2, this.app.height - 60);
    this.particles.addSpawnModule(new RateSpawn({
      rate: new Constant(80),
      lifetime: new Constant(2),
      velocity: new ConeDirection(-Math.PI / 2, Math.PI / 6, 120, 220),
    }));
    this.particles.addUpdateModule(new ApplyForce(0, 180));
    this.particles.addUpdateModule(new ScaleOverLifetime(new Curve([
      { t: 0, v: 6 },
      { t: 1, v: 0 },
    ])));
    this.systems.add(this.particles);
  }

  override draw(context: RenderingContext): void {
    context.render(this.particles);
  }
}

const app = new Application({
  scenes: { FountainScene },
  extensions: [particlesExtension],
  canvas: { width: 800, height: 600, mount: 'body' },
  clearColor: Color.black,
});

await app.start(FountainScene);
// #endregion guide:basic-emitter
