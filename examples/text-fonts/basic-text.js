// Auto-generated from basic-text.ts - edit the .ts source, not this file.
import { Application, Asset, Color, FixedResolutionCanvasSizing, Scene, Text } from '@codexo/exojs';
class BasicTextScene extends Scene {
  elapsed = 0;
  text;
  async load() {
    const app = this.app;
    await this.loader.load(Asset.type('font', 'font/Kenney Future.ttf', { family: 'Kenney Future' }));
    const { width, height } = app;
    this.text = new Text('Hello World!', {
      align: 'left',
      fillColor: Color.white,
      outlineColor: Color.black,
      outlineWidth: 0.2,
      fontSize: 25,
      fontFamily: 'Kenney Future',
    });
    this.text.setPosition(width / 2, height / 2);
    this.text.setAnchor(0.5, 0.5);
  }
  update(delta) {
    this.elapsed += delta;
    this.text.text = `Hello World! ${this.elapsed | 0}`;
    this.text.rotate(delta * 36);
  }
  draw(context) {
    context.render(this.text);
  }
}
const app = new Application({
  scenes: { BasicTextScene },
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
await app.start(BasicTextScene);
