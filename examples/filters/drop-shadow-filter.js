// Auto-generated from drop-shadow-filter.ts - edit the .ts source, not this file.
import { Application, Color, DropShadowFilter, FixedResolutionCanvasSizing, Scene, Sprite } from '@codexo/exojs';
import { mountControlPanel, mountControls } from '@examples/runtime';
const SHIP = assets.demo.textures.shipA;
class DropShadowFilterScene extends Scene {
  shadow;
  sprite;
  elapsed = 0;
  hud;
  panel;
  init() {
    const { width, height } = this.app;
    // A shadow that trails the ship down and to the right, soft enough to read
    // as depth rather than as a second sprite.
    this.shadow = new DropShadowFilter({ offsetX: 12, offsetY: 16, blur: 6, quality: 2, color: new Color(0, 0, 0, 0.6) });
    this.sprite = new Sprite(this.loader.get(SHIP))
      .setAnchor(0.5)
      .setScale(10)
      .setPosition(width / 2, height / 2);
    this.sprite.filters = [this.shadow];
    this.hud = mountControls({
      title: 'Drop Shadow Filter',
      hint: "The shadow is the sprite's silhouette, blurred and offset, drawn behind the unchanged sprite.",
      status: this.statusText(),
    });
    this.panel = mountControlPanel({ title: 'Shadow' });
    this.panel.addSlider({
      label: 'Offset X',
      min: -40,
      max: 40,
      step: 1,
      value: this.shadow.offsetX,
      onChange: value => {
        this.shadow.offsetX = value;
        this.refresh();
      },
    });
    this.panel.addSlider({
      label: 'Offset Y',
      min: -40,
      max: 40,
      step: 1,
      value: this.shadow.offsetY,
      onChange: value => {
        this.shadow.offsetY = value;
        this.refresh();
      },
    });
    this.panel.addSlider({
      label: 'Blur',
      min: 0,
      max: 24,
      step: 0.5,
      value: this.shadow.blur,
      onChange: value => {
        this.shadow.blur = value;
        this.refresh();
      },
    });
    this.panel.addSlider({
      label: 'Opacity',
      min: 0,
      max: 1,
      step: 0.05,
      value: this.shadow.color.a,
      onChange: value => {
        this.shadow.color = new Color(0, 0, 0, value);
        this.refresh();
      },
    });
    this.panel.addToggle({
      label: 'Shadow only',
      value: false,
      onChange: on => {
        this.shadow.shadowOnly = on;
        this.refresh();
      },
    });
  }
  update(delta) {
    this.elapsed += delta;
    this.sprite.setRotation(Math.sin(this.elapsed * 0.8) * 20);
  }
  statusText() {
    const { offsetX, offsetY, blur } = this.shadow;
    return `offset ${offsetX}, ${offsetY} · blur ${blur.toFixed(1)} · opacity ${this.shadow.color.a.toFixed(2)}`;
  }
  refresh() {
    this.hud.setStatus(this.statusText());
  }
  draw(context) {
    context.render(this.sprite);
  }
}
const app = new Application({
  scenes: { DropShadowFilterScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(30, 34, 44),
  loader: {
    basePath: 'assets/',
  },
});
await app.start(DropShadowFilterScene);
