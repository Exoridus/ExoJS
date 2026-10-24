// Auto-generated from render-to-texture.ts - edit the .ts source, not this file.
import {
  Application,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  Keyboard,
  Rectangle,
  RenderTexture,
  Scene,
  Sprite,
  Text,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel } from '@examples/runtime';
class RenderToTextureScene extends Scene {
  source = this.track(new Container());
  texture;
  liveTarget = this.track(new RenderTexture(320, 240));
  target = this.track(new RenderTexture(320, 240));
  live;
  snapshot;
  figures = [];
  labels = [];
  panel;
  captureRequested = true;
  captureCount = 0;
  capturedTime = 0;
  time = 0;
  playing = true;
  async load() {
    this.texture = await this.loader.load(assets.platformerTilesImage);
  }
  init() {
    for (let i = 0; i < 6; i++) {
      const figure = new Sprite(this.texture)
        .setTextureFrame(new Rectangle(650, 325, 64, 64))
        .setAnchor(0.5)
        .setScale(0.9)
        .setPosition(60 + (i % 3) * 100, 70 + Math.floor(i / 3) * 100);
      this.figures.push(figure);
      this.source.addChild(figure);
    }
    this.live = new Sprite(this.liveTarget);
    this.snapshot = new Sprite(this.target);
    this.labels = ['Live source', 'Frozen capture'].map(text =>
      new Text(text, { fillColor: Color.white, fontSize: 14, align: 'center' }).setAnchor(0.5),
    );
    this.root.addChild(this.live, this.snapshot, ...this.labels);
    this.panel = demoPanel({
      title: 'Capture a Texture',
      layout: 'bar',
      controls: {},
      hint: 'Click / Space captures once. The scene owns both render textures until it ends.',
      actions: {
        Capture: () => this.capture(),
        'Pause / Resume': () => {
          this.playing = !this.playing;
        },
        Reset: () => {
          this.time = 0;
          this.captureCount = 0;
          this.capture();
        },
      },
    });
    this.inputs.onTrigger(Keyboard.Space, () => this.capture());
    this.inputs.onTrigger(Keyboard.R, () => {
      this.time = 0;
      this.captureCount = 0;
      this.capture();
    });
    this.app.input.onPointerTap.add(this.onTap);
  }
  capture() {
    this.captureRequested = true;
  }
  onTap = () => this.capture();
  update(delta) {
    if (this.playing) {
      this.time += delta;
    }
    this.figures.forEach((figure, index) => (figure.rotation = this.time * (30 + index * 12)));
    const { scale, width, contentHeight } = this.panel.fit(this.app, this.app.canvas);
    this.root.setScale(scale);
    const size = Math.min(width * 0.43, ((contentHeight - 44) * 4) / 3);
    for (const [index, sprite] of [this.live, this.snapshot].entries()) {
      sprite.width = size;
      sprite.height = size * 0.75;
      sprite.setPosition(width * (index === 0 ? 0.25 : 0.75) - size / 2, (contentHeight - size * 0.75) / 2 + 12);
      this.labels[index].setPosition(width * (index === 0 ? 0.25 : 0.75), 16);
    }
    this.panel.status(
      `Live ${this.time.toFixed(1)}s | capture #${this.captureCount} at ${this.capturedTime.toFixed(1)}s | ${this.playing ? 'running' : 'paused'}`,
    );
  }
  draw(context) {
    if (this.texture.ready) {
      context.renderTo(this.source, { target: this.liveTarget, clear: new Color(40, 54, 62) });
      if (this.captureRequested) {
        context.renderTo(this.source, { target: this.target, clear: new Color(40, 54, 62) });
        this.captureRequested = false;
        this.capturedTime = this.time;
        this.captureCount++;
      }
    }
    context.render(this.root);
  }
  destroy() {
    this.app.input.onPointerTap.remove(this.onTap);
    this.panel.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { RenderToTextureScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(20, 27, 34),
});
await app.start(RenderToTextureScene);
