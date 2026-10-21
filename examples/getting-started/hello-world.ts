import { Application, Color, FixedResolutionCanvasSizing, Scene, type Seconds, Sprite, Text } from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';

// #region guide:first-scene
class HelloWorldScene extends Scene {
  private sprite!: Sprite;
  private hint!: Text;
  private playing = true;

  override init(): void {
    const app = this.app;
    const { width, height } = app;

    this.sprite = new Sprite(this.loader.get(assets.ship));
    this.sprite.setAnchor(0.5);
    this.sprite.setScale(1.5);
    this.sprite.setPosition(width / 2, height / 2);
    this.sprite.interactive = true;
    this.sprite.onPointerTap.add(() => {
      this.playing = !this.playing;
      this.sprite.setTint(this.playing ? Color.white : new Color(150, 170, 190));
      this.hint.text = this.playing ? 'Click the ship to pause it' : 'Paused - click the ship to resume';
    });

    this.hint = new Text('Click the ship to pause it', { fillColor: new Color(170, 188, 225), fontSize: 22 });
    this.hint.setAnchor(0.5, 0.5);
    this.hint.setPosition(width / 2, height - 90);

    this.root.addChild(this.sprite, this.hint);
  }

  override update(delta: Seconds): void {
    if (this.playing) {
      this.sprite.rotate(delta * 90);
    }
  }
}
// #endregion guide:first-scene

const app = new Application({
  scenes: { HelloWorldScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(12, 16, 30),
});

await app.start(HelloWorldScene);
