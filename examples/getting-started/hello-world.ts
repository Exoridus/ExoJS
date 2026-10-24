import {
  Application,
  Color,
  FixedResolutionCanvasSizing,
  Keyboard,
  Scene,
  type Seconds,
  type Sprite,
  Spritesheet,
  Text,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { unitsPerCssPixel } from '@examples/runtime';

// #region guide:first-scene
class HelloWorldScene extends Scene {
  private sprite!: Sprite;
  private hint!: Text;
  private playing = true;

  override async load(): Promise<void> {
    await this.loader.load(assets.platformerTilesImage);
    const data = await this.loader.load(assets.platformerTilesAtlas);
    this.sprite = new Spritesheet(this.loader.get(assets.platformerTilesImage), data).getFrameSprite('key_yellow');
  }

  override init(): void {
    const app = this.app;
    const { width, height } = app;

    this.sprite.setAnchor(0.5);
    this.sprite.setScale(2);
    this.sprite.setPosition(width / 2, height / 2);
    this.sprite.interactive = true;

    const toggle = (): void => {
      this.playing = !this.playing;
      this.sprite.setTint(this.playing ? Color.white : new Color(150, 170, 190));
      this.hint.text = this.playing ? 'Click the key or Space to pause' : 'Paused - click the key or Space to resume';
    };

    this.sprite.onPointerTap.add(toggle);
    this.inputs.onTrigger(Keyboard.Space, toggle);

    this.hint = new Text('Click the key or Space to pause', { fillColor: new Color(168, 175, 181), fontSize: 22 });
    this.hint.setAnchor(0.5, 0.5);
    this.hint.setPosition(width / 2, height - 90);

    this.root.addChild(this.sprite, this.hint);
  }

  override update(delta: Seconds): void {
    const k = unitsPerCssPixel(this.app, this.app.canvas as HTMLCanvasElement);
    this.hint.style.fontSize = 15 * k;
    this.hint.y = this.app.height - 36 * k;
    this.sprite.setScale(2 * Math.max(1, k * 0.65));

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
  clearColor: new Color(18, 24, 29),
});

await app.start(HelloWorldScene);
