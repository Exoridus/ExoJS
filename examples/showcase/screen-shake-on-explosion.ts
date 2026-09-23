import { Application, Color, FixedResolutionCanvasSizing, type RenderingContext, Scene, Sprite, Time, Vector, View } from '@codexo/exojs';
import { AlphaFadeOverLifetime, BurstSpawn, ConeDirection, Constant, particlesExtension, ParticleSystem } from '@codexo/exojs-particles';
import { mountControls } from '@examples/runtime';

class ScreenShakeOnExplosionScene extends Scene {
  private view!: View;
  private ps!: ParticleSystem;
  private burstPos!: Vector;
  private burst!: BurstSpawn;
  private ship!: Sprite;
  private flash = new Color(255, 255, 255);
  private hits = 0;
  private hud!: ReturnType<typeof mountControls>;

  override init(): void {
    const app = this.app;
    const { width, height } = app;

    this.view = new View(width / 2, height / 2, width, height);
    this.ship = new Sprite(this.loader.get('image/ship-a.png'))
      .setAnchor(0.5)
      .setScale(2.2)
      .setPosition(width / 2, height / 2);
    this.hud = mountControls({
      title: 'Impact Feedback',
      controls: [{ keys: 'Click', action: 'flash the ship, burst particles, and shake the camera' }],
      status: 'Hits: 0',
    });
    this.ps = new ParticleSystem(this.loader.get('image/particle-light.png'), { capacity: 5000 });
    this.systems.add(this.ps);
    this.ps.setPosition(width / 2, height / 2);
    this.burstPos = new Vector(0, 0);
    this.burst = new BurstSpawn({
      schedule: [{ time: 0, count: 160 }],
      lifetime: new Constant(0.9),
      position: new Constant(this.burstPos),
      velocity: ConeDirection.omni(100, 360),
      scale: new Constant(new Vector(0.22, 0.22)),
    });
    this.ps.addSpawnModule(this.burst);
    this.ps.addUpdateModule(new AlphaFadeOverLifetime());
    app.input.onPointerTap.add(p => {
      this.burstPos.set(p.x - this.ps.position.x, p.y - this.ps.position.y);
      this.burst.reset();
      this.view.shake(22, Time.seconds(0.28), { frequency: 26, decay: true });
      this.hits++;
      this.hud.setStatus(`Hits: ${this.hits}`);
      this.flash.set(255, 120, 120, 1);
      app.tweens.create(this.flash).to({ r: 255, g: 255, b: 255 }, 0.2).start();
    });
  }

  override update(): void {
    this.ship.setTint(this.flash);
  }

  override draw(context: RenderingContext): void {
    context.render(this.ps, { view: this.view });
    context.render(this.ship, { view: this.view });
  }
}

const app = new Application({
  scenes: { ScreenShakeOnExplosionScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
  loader: {
    basePath: 'assets/',
  },
  extensions: [particlesExtension],
});

await app.start(ScreenShakeOnExplosionScene);
