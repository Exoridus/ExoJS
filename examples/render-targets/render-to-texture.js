// Auto-generated from render-to-texture.ts - edit the .ts source, not this file.
import { Application, Color, Container, FixedResolutionCanvasSizing, RenderTexture, Scene, Sprite, Text } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';
class RenderToTextureScene extends Scene {
  source;
  texture;
  liveTarget;
  live;
  ships = [];
  target;
  snapshot;
  labels;
  captureRequested = true;
  captures = 0;
  hud;
  time = 0;
  init() {
    this.texture = this.loader.get(assets.demo.textures.shipA);
    this.source = new Container();
    for (let i = 0; i < 25; i++) {
      const ship = new Sprite(this.texture)
        .setAnchor(0.5)
        .setScale(2)
        .setPosition(50 + (i % 5) * 55, 30 + Math.floor(i / 5) * 45);
      this.source.addChild(ship);
      this.ships.push(ship);
    }
    this.liveTarget = new RenderTexture(320, 240);
    this.live = new Sprite(this.liveTarget).setPosition(170, 220);
    this.target = new RenderTexture(320, 240);
    this.snapshot = new Sprite(this.target).setPosition(790, 220);
    this.labels = [
      new Text('Live source', { fillColor: Color.white, fontSize: 32 }).setPosition(170, 160),
      new Text('Frozen snapshot', { fillColor: Color.white, fontSize: 32 }).setPosition(790, 160),
    ];
    this.hud = mountControls({
      title: 'Capture a Texture',
      controls: [{ keys: 'Click', action: 'capture the current source frame' }],
      status: 'Waiting for the source texture...',
      hint: 'The left group keeps moving while the right texture stays frozen until the next click.',
    });
    this.app.input.onPointerTap.add(() => {
      this.captureRequested = true;
    });
  }
  update(delta) {
    this.time += delta;
    for (let i = 0; i < this.ships.length; i++) {
      this.ships[i].setRotation(this.time * (20 + (i % 5) * 12));
    }
  }
  draw(context) {
    context.renderTo(this.source, { target: this.liveTarget, clear: Color.black });
    if (this.captureRequested && this.texture.ready) {
      context.renderTo(this.source, { target: this.target, clear: Color.black });
      this.captureRequested = false;
      this.captures++;
      this.hud.setStatus(`Captures: ${this.captures}`);
    } else if (this.texture.state === 'failed') {
      this.hud.setStatus('The source texture failed to load.');
    }
    context.render(this.live);
    context.render(this.snapshot);
    for (const label of this.labels) context.render(label);
  }
  destroy() {
    this.liveTarget.destroy();
    this.target.destroy();
    super.destroy();
  }
}
const app = new Application({
  scenes: { RenderToTextureScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(12, 18, 28),
});
await app.start(RenderToTextureScene);
