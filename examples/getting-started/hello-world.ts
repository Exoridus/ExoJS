import {
  Application,
  Color,
  FixedResolutionCanvasSizing,
  Keyboard,
  Rectangle,
  Scene,
  type Seconds,
  type Sprite,
  Spritesheet,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { startExample, unitsPerCssPixel } from '@examples/runtime';

// #region guide:first-scene
class HelloWorldScene extends Scene {
  private sprite!: Sprite;
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
    // The atlas tile includes transparent padding around the key.
    this.sprite.hitArea = new Rectangle(8, 16, 48, 32);

    const toggle = (): void => {
      this.playing = !this.playing;
      this.sprite.setTint(this.playing ? Color.white : new Color(150, 170, 190));
    };

    this.sprite.onPointerTap.add(toggle);
    this.inputs.onTrigger(Keyboard.Space, toggle);

    this.root.addChild(this.sprite);
  }

  override update(delta: Seconds): void {
    const k = unitsPerCssPixel(this.app, this.app.canvas as HTMLCanvasElement);
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

await startExample(app, () => app.start(HelloWorldScene));
