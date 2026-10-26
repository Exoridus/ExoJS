// Auto-generated from crt-scanlines.ts - edit the .ts source, not this file.
import { Application, Color, Container, CrtFilter, FixedResolutionCanvasSizing, Scene, Sprite, Text } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, slider, startExample, toggle } from '@examples/runtime';
class RetroDisplayScene extends Scene {
  stage;
  background;
  title;
  filter;
  panel;
  async load() {
    await this.loader.load(assets.uvGrid256);
  }
  init() {
    const { width, height } = this.app;
    this.background = new Sprite(this.loader.get(assets.uvGrid256)).setAnchor(0.5).setPosition(width / 2, height / 2);
    this.background.width = width;
    this.background.height = height;
    this.title = new Text('SIGNAL LOST', { fillColor: Color.white, fontSize: 96, outlineColor: Color.black, outlineWidth: 0.12 });
    this.title.setAnchor(0.5).setPosition(width / 2, height / 2);
    this.stage = new Container();
    this.stage.addChild(this.background, this.title);
    // #region guide:retro-filter
    this.filter = new CrtFilter();
    this.stage.filters = [this.filter];
    // #endregion guide:retro-filter
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      controls: {
        crt: toggle('CRT', true),
        strength: slider('Effect strength', { min: 0, max: 1, value: 0.8, step: 0.05, format: value => `${Math.round(value * 100)}%` }),
        split: slider('RGB separation', { min: 0, max: 0.02, value: 0.006, step: 0.001, format: value => value.toFixed(3) }),
      },
      onChange: (key, _value, values) => {
        if (key === 'crt') {
          this.stage.filters = values.crt ? [this.filter] : [];
        } else if (key === 'strength') {
          this.filter.strength = values.strength;
        } else if (key === 'split') {
          this.filter.rgbSeparation = values.split;
        }
      },
    });
  }
  update(delta) {
    const pageWidth = window.frameElement?.ownerDocument.documentElement.clientWidth ?? window.innerWidth;
    const height = pageWidth < 600 ? Math.max(1200, Math.ceil((360 * 1280) / pageWidth)) : 720;
    if (this.app.height !== height) {
      this.app.resize(1280, height);
    }
    const { width, contentHeight, scale } = this.panel.fit(this.app, this.app.canvas);
    this.stage.setScale(scale);
    this.background.setPosition(width / 2, contentHeight / 2);
    this.background.width = width;
    this.background.height = contentHeight;
    this.title.setPosition(width / 2, contentHeight / 2);
    this.title.style.fontSize = Math.min(72, Math.max(18, contentHeight * 0.2));
    this.filter.time += delta;
  }
  draw(context) {
    context.render(this.stage, { view: context.screenView });
  }
  destroy() {
    this.panel.dispose();
    this.filter.destroy();
    super.destroy();
  }
}
const app = new Application({
  scenes: { RetroDisplayScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: Color.black,
});
await startExample(app, () => app.start(RetroDisplayScene));
