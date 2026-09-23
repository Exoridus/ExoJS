// Auto-generated from blur-filter.ts - edit the .ts source, not this file.
import { Application, BlurFilter, Color, DropShadowFilter, FixedResolutionCanvasSizing, Scene, Sprite, Text } from '@codexo/exojs';
import { mountControlPanel, mountControls } from '@examples/runtime';
const SHIP = assets.demo.textures.shipA;
class BlurAndShadowScene extends Scene {
  reference;
  filtered;
  blur = new BlurFilter({ strength: 3 });
  shadow = new DropShadowFilter({ offsetX: 16, offsetY: 20, blur: 8, quality: 2, color: new Color(0, 0, 0, 0.8) });
  mode = 'blur';
  enabled = true;
  hud;
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
    this.hud = mountControls({ title: 'Blur and Drop Shadow', hint: 'Compare the original sprite with a blurred sprite or an offset shadow.' });
    const panel = mountControlPanel({ title: 'Filter' });
    panel.addButton({
      label: 'Blur',
      onClick: () => {
        this.mode = 'blur';
        this.refresh();
      },
    });
    panel.addButton({
      label: 'Drop shadow',
      onClick: () => {
        this.mode = 'shadow';
        this.refresh();
      },
    });
    panel.addSlider({
      label: 'Blur strength',
      min: 0,
      max: 8,
      step: 0.1,
      value: this.blur.strength,
      onChange: value => {
        this.blur.strength = value;
        this.refresh();
      },
    });
    panel.addSlider({
      label: 'Shadow offset',
      min: -40,
      max: 40,
      step: 1,
      value: this.shadow.offsetX,
      onChange: value => {
        this.shadow.offsetX = value;
        this.shadow.offsetY = value;
        this.refresh();
      },
    });
    panel.addToggle({
      label: 'Filter',
      value: true,
      onChange: value => {
        this.enabled = value;
        this.refresh();
      },
    });
    this.refresh();
  }
  refresh() {
    this.filtered.filters = this.enabled ? [this.mode === 'blur' ? this.blur : this.shadow] : [];
    this.labels[1].text = this.enabled ? (this.mode === 'blur' ? 'Blurred' : 'Drop shadow') : 'Bypassed';
    this.hud.setStatus(
      this.mode === 'blur'
        ? `Blur strength: ${this.blur.strength.toFixed(1)} px${this.enabled ? '' : ' (bypassed)'}`
        : `Shadow offset: ${this.shadow.offsetX} px${this.enabled ? '' : ' (bypassed)'}`,
    );
  }
  draw(context) {
    context.render(this.reference);
    context.render(this.filtered);
    for (const label of this.labels) context.render(label);
  }
}
const app = new Application({
  scenes: { BlurAndShadowScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(38, 44, 60),
});
await app.start(BlurAndShadowScene);
