// Auto-generated from screen-shake-on-explosion.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Scene, Sprite, Time, Vector, View } from '@codexo/exojs';
import { AlphaFadeOverLifetime, BurstSpawn, ConeDirection, Constant, particlesExtension, ParticleSystem } from '@codexo/exojs/particles';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
class ScreenShakeOnExplosionScene extends Scene {
  onPointerTap = p => {
    this.burstPos.set(p.x - this.ps.position.x, p.y - this.ps.position.y);
    this.burst.reset();
    this.view.shake(22, Time.seconds(0.28), { frequency: 26, decay: true });
    this.flash.set(255, 120, 120, 1);
    this.tweens.create(this.flash).to({ r: 255, g: 255, b: 255 }, 0.2).start();
  };
  view;
  ps;
  burstPos;
  burst;
  ship;
  flash = new Color(255, 255, 255);
  init() {
    const app = this.app;
    const { width, height } = app;
    this.view = new View(width / 2, height / 2, width, height);
    this.ship = new Sprite(this.loader.get(assets.ship))
      .setAnchor(0.5)
      .setScale(2.2)
      .setPosition(width / 2, height / 2);
    this.ps = new ParticleSystem(this.loader.get(assets.particleLight), { capacity: 5000 });
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
    this.app.input.onPointerTap.add(this.onPointerTap);
  }
  update() {
    this.ship.setTint(this.flash);
  }
  draw(context) {
    context.render(this.ps, { view: this.view });
    context.render(this.ship, { view: this.view });
  }
  destroy() {
    this.app.input.onPointerTap.remove(this.onPointerTap);
    this.view?.destroy();
    this.ship?.destroy();
    this.burstPos?.destroy();
    super.destroy();
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
  extensions: [particlesExtension],
});
await app.start(ScreenShakeOnExplosionScene);
