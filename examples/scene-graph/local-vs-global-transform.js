// Auto-generated from local-vs-global-transform.ts - edit the .ts source, not this file.
import { Application, Color, Container, FixedResolutionCanvasSizing, Scene, Sprite, Text } from '@codexo/exojs';
class LocalVsGlobalTransformScene extends Scene {
  parent;
  localSprite;
  globalSprite;
  localLabel;
  globalLabel;
  init() {
    const app = this.app;
    const { width, height } = app;
    const texture = this.loader.get('image/ship-a.png');
    this.parent = new Container().setPosition(width / 4, height / 2);
    this.localSprite = new Sprite(texture)
      .setAnchor(0.5)
      .setScale(0.8)
      .setPosition(160, 0)
      .setTint(new Color(120, 190, 255));
    this.globalSprite = new Sprite(texture)
      .setAnchor(0.5)
      .setScale(0.8)
      .setPosition((width * 3) / 4, height / 2)
      .setTint(new Color(255, 190, 120));
    this.parent.addChild(this.localSprite);
    this.localLabel = new Text('inherited rotation', { fillColor: Color.white, fontSize: 16 });
    this.localLabel.setPosition(width / 4 - 60, height / 2 - 220);
    this.globalLabel = new Text('screen-space', { fillColor: Color.white, fontSize: 16 });
    this.globalLabel.setPosition((width * 3) / 4 - 50, height / 2 - 220);
  }
  update(delta) {
    this.parent.rotate(delta * 60);
  }
  draw(context) {
    context.render(this.parent);
    context.render(this.globalSprite);
    context.render(this.localLabel);
    context.render(this.globalLabel);
  }
}
const app = new Application({
  scenes: { LocalVsGlobalTransformScene },
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
app.start(LocalVsGlobalTransformScene);
