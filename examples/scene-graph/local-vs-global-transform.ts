import { Application, Color, Container, FixedResolutionCanvasSizing, Scene, type Seconds, Sprite, Text, Texture } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';

class LocalVsGlobalTransformScene extends Scene {
  private parent!: Container;
  private localSprite!: Sprite;
  private globalSprite!: Sprite;
  private localLabel!: Text;
  private globalLabel!: Text;

  override init(): void {
    const app = this.app;
    const { width, height } = app;
    const texture = new Texture(assets.ship.source);

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
    this.root.addChild(this.parent, this.globalSprite, this.localLabel, this.globalLabel);
  }

  override update(delta: Seconds): void {
    this.parent.rotate(delta * 60);
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
});

await app.start(LocalVsGlobalTransformScene);
