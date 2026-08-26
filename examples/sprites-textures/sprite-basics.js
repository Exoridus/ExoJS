// Auto-generated from sprite-basics.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Scene, Sprite } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';
class SpriteBasicsScene extends Scene {
  ship;
  // A single reusable tint colour whose alpha channel we animate each frame.
  tint = new Color(120, 200, 255, 1);
  elapsed = 0;
  hud;
  init() {
    const app = this.app;
    const { width, height } = app;
    this.ship = new Sprite(this.loader.get('image/ship-a.png'));
    this.ship.setPosition((width / 2) | 0, (height / 2) | 0);
    this.ship.setAnchor(0.5);
    this.ship.setScale(3);
    this.ship.setTint(this.tint);
    this.hud = mountControls({
      title: 'Sprite Basics',
      hint: 'One Sprite, four transforms: position drifts, rotation spins, scale pulses, alpha fades.',
      status: 'alpha 1.00',
    });
  }
  update(delta) {
    const app = this.app;
    this.elapsed += delta;
    const { width, height } = app;
    // Position: a gentle figure-eight drift around the canvas centre.
    const driftX = Math.sin(this.elapsed * 0.8) * 90;
    const driftY = Math.sin(this.elapsed * 1.6) * 50;
    this.ship.setPosition(width / 2 + driftX, height / 2 + driftY);
    // Rotation: a steady spin (degrees per second).
    this.ship.rotate(delta * 90);
    // Scale: a slow breathing pulse between 2.4x and 3.6x.
    this.ship.setScale(3 + Math.sin(this.elapsed * 1.2) * 0.6);
    // Alpha: fade the tint's alpha channel between 0.2 and 1.0 and re-apply.
    const alpha = 0.6 + Math.sin(this.elapsed * 2) * 0.4;
    this.tint.a = alpha;
    this.ship.setTint(this.tint);
    this.hud.setStatus(`alpha ${alpha.toFixed(2)}`);
  }
  draw(context) {
    context.render(this.ship);
  }
}
const app = new Application({
  scenes: { SpriteBasicsScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(18, 20, 28),
  loader: {
    basePath: 'assets/',
  },
});
await app.start(SpriteBasicsScene);
