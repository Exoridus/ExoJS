// Auto-generated from blur-filter.ts - edit the .ts source, not this file.
import { Application, BlurFilter, Color, DropShadowFilter, FixedResolutionCanvasSizing, Scene, Sprite, Text } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { choice, demoPanel, slider } from '@examples/runtime';
const SHIP = assets.ship;
class BlurAndShadowScene extends Scene {
  reference;
  filtered;
  blur = new BlurFilter({ strength: 3 });
  shadow = new DropShadowFilter({ offsetX: 15, offsetY: 18, blur: 8, quality: 2, color: new Color(0, 0, 0, 0.8) });
  panel;
  labels;
  init() {
    const { width, height } = this.app;
    const texture = this.loader.get(SHIP);
    this.reference = new Sprite(texture)
      .setAnchor(0.5)
      .setScale(8)
      .setPosition(width * 0.3, height * 0.53);
    this.filtered = new Sprite(texture)
      .setAnchor(0.5)
      .setScale(8)
      .setPosition(width * 0.7, height * 0.53);
    this.labels = [
      new Text('Original', { fillColor: Color.white, fontSize: 25 }).setAnchor(0.5).setPosition(width * 0.3, height * 0.78),
      new Text('Blur', { fillColor: Color.white, fontSize: 25 }).setAnchor(0.5).setPosition(width * 0.7, height * 0.78),
    ];
    this.panel = demoPanel({
      title: 'Blur and Drop Shadow',
      controls: {
        filter: choice('Filter', ['Blur', 'Drop shadow']),
        strength: slider('Strength', { min: 0, max: 8, value: 3, step: 0.1, format: value => value.toFixed(1) }),
      },
      onChange: (_key, _value, values) => {
        this.blur.strength = values.strength;
        this.shadow.offsetX = values.strength * 5;
        this.shadow.offsetY = values.strength * 6;
        this.filtered.filters = [values.filter === 'Blur' ? this.blur : this.shadow];
        this.labels[1].text = values.filter;
      },
    });
  }
  draw(context) {
    context.render(this.reference);
    context.render(this.filtered);
    for (const label of this.labels) {
      context.render(label);
    }
  }
  destroy() {
    this.panel.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { BlurAndShadowScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(38, 44, 60),
});
await app.start(BlurAndShadowScene);
