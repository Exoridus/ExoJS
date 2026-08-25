// Auto-generated from web-fonts.ts - edit the .ts source, not this file.
import { Application, Asset, Color, FixedResolutionCanvasSizing, Scene, Text } from '@codexo/exojs';
class WebFontsScene extends Scene {
  default;
  loaded;
  async load() {
    const app = this.app;
    await this.loader.load(Asset.type('font', 'font/Kenney Future.ttf', { family: 'Kenney Future' }));
    const { width, height } = app;
    this.default = new Text('Default Font', { fillColor: Color.white, fontSize: 52, align: 'center' });
    this.default.setAnchor(0.5, 0.5);
    this.default.setPosition(width / 2, height / 2 - 60);
    this.loaded = new Text('Kenney Future Font', { fillColor: Color.white, fontFamily: 'Kenney Future', fontSize: 52, align: 'center' });
    this.loaded.setAnchor(0.5, 0.5);
    this.loaded.setPosition(width / 2, height / 2 + 60);
  }
  draw(context) {
    context.render(this.default);
    context.render(this.loaded);
  }
}
const app = new Application({
  scenes: { WebFontsScene },
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
});
app.start(WebFontsScene);
