// Auto-generated from blur-filter.ts - edit the .ts source, not this file.
import {
  Application,
  BlurFilter,
  Color,
  ColorMatrixFilter,
  DropShadowFilter,
  FixedResolutionCanvasSizing,
  Keyboard,
  Rectangle,
  Scene,
  Sprite,
  Text,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { choice, demoPanel, slider, startExample, toggle } from '@examples/runtime';
const controls = {
  filter: choice('Filter', ['Blur', 'Drop Shadow', 'Grayscale', 'Sepia']),
  strength: slider('Effect strength', { min: 0, max: 1, step: 0.05, value: 0.5, format: value => `${Math.round(value * 100)}%` }),
  bypass: toggle('Bypass'),
};
class BlurAndShadowScene extends Scene {
  sprites = [];
  labels = [];
  blur = this.track(new BlurFilter({ strength: 4 }));
  shadow = this.track(new DropShadowFilter({ offsetX: 15, offsetY: 18, blur: 8, color: new Color(0, 0, 0, 0.8) }));
  color = this.track(new ColorMatrixFilter());
  panel;
  async load() {
    await this.loader.load(assets.platformerTilesImage);
  }
  init() {
    this.sprites = [0, 1].map(() =>
      new Sprite(this.loader.get(assets.platformerTilesImage)).setTextureFrame(new Rectangle(650, 325, 64, 64)).setAnchor(0.5),
    );
    this.labels = ['Reference', 'Filtered'].map(text =>
      new Text(text, { fillColor: Color.white, fontSize: 14, align: 'center' }).setAnchor(0.5),
    );
    this.root.addChild(...this.sprites, ...this.labels);
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      controls,
    });
    this.inputs.onTrigger(Keyboard.Space, () => this.panel.step('bypass'));
  }
  update() {
    const { scale, width, contentHeight } = this.panel.fit(this.app, this.app.canvas);
    this.root.setScale(scale);
    const { filter, strength, bypass } = this.panel.values;
    this.blur.strength = strength * 12 * scale;
    this.shadow.offsetX = strength * 24 * scale;
    this.shadow.offsetY = strength * 24 * scale;
    this.shadow.blur = 5 * scale;
    this.color.reset();
    if (filter === 'Grayscale') {
      this.color.saturate(1 - strength);
    }
    if (filter === 'Sepia') {
      this.color.sepia();
      const matrix = this.color.matrix;
      this.color.setMatrix(
        matrix.map((value, index) => value * strength + (index === 0 || index === 6 || index === 12 || index === 18 ? 1 - strength : 0)),
      );
    }
    this.sprites[1].filters = bypass ? [] : [filter === 'Blur' ? this.blur : filter === 'Drop Shadow' ? this.shadow : this.color];
    for (let i = 0; i < 2; i++) {
      this.sprites[i].setPosition(width * (i === 0 ? 0.25 : 0.75), contentHeight * 0.55).setScale(Math.min(3, contentHeight / 80));
      this.labels[i].setPosition(width * (i === 0 ? 0.25 : 0.75), 18);
    }
    const label =
      filter === 'Blur'
        ? `Radius ${(strength * 12).toFixed(1)} CSS px`
        : filter === 'Drop Shadow'
          ? `Offset ${(strength * 24).toFixed(1)} CSS px; alpha 0.8`
          : `Amount ${(strength * 100).toFixed(0)}%`;
    this.panel.status(`${bypass ? 'Bypass' : filter} | ${label}`);
  }
  draw(context) {
    context.render(this.root);
  }
  destroy() {
    this.sprites[1].filters = [];
    this.panel.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { BlurAndShadowScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(38, 44, 52),
});
await startExample(app, () => app.start(BlurAndShadowScene));
