import {
  ActionMap,
  AnimatedSprite,
  Application,
  ButtonAction,
  Color,
  FixedResolutionCanvasSizing,
  Graphics,
  Keyboard,
  type Rectangle,
  type RenderingContext,
  Scene,
  Spritesheet,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, slider, startExample } from '@examples/runtime';

class FrameAnimationScene extends Scene {
  private sprite!: AnimatedSprite;
  private frames: Rectangle[] = [];
  private readonly ground = this.track(new Graphics());
  private readonly actions = new ActionMap({ pause: new ButtonAction(Keyboard.Space) });
  private panel!: ReturnType<typeof demoPanel<{ fps: ReturnType<typeof slider> }>>;

  override async load(): Promise<void> {
    const [texture, data] = await Promise.all([
      this.loader.load(assets.platformerCharactersImage),
      this.loader.load(assets.platformerCharactersAtlas),
    ]);
    const sheet = new Spritesheet(texture, data);

    this.track({ destroy: () => sheet.clear() });
    this.frames = ['character_green_walk_a', 'character_green_walk_b'].map(name => sheet.getFrame(name));
    this.sprite = new AnimatedSprite(texture, { walk: { frames: this.frames, fps: 8 } }).setAnchor(0.5, 1).play('walk');
  }

  override init(): void {
    this.root.addChild(this.ground, this.sprite);
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      controls: { fps: slider('FPS', { min: 1, max: 24, step: 1, value: 8, format: value => `${value} fps` }) },
      actions: { Pause: () => this.pause() },
      onChange: (_key, fps) => this.sprite.addClip('walk', { frames: this.frames, fps }),
    });
    this.inputs.attach(this.actions);
  }

  private pause(): void {
    if (this.sprite.playing) {
      this.sprite.pause();
    } else {
      this.sprite.resume();
    }
  }

  override update(): void {
    if (this.actions.pause.pressed) {
      this.pause();
    }

    const { scale: k, width, contentHeight } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    const size = Math.min(320, contentHeight * 0.8, width * 0.65) * k;
    const baseline = (contentHeight + size / k) * 0.5 * k;

    this.sprite.setPosition(this.app.width / 2, baseline).setScale(size / 128);
    this.ground.clear();
    this.ground.lineColor = new Color(134, 155, 141);
    this.ground.lineWidth = 2 * k;
    this.ground.moveTo(this.app.width / 2 - size * 0.7, baseline).lineTo(this.app.width / 2 + size * 0.7, baseline);
    this.panel.actions.Pause!.label = this.sprite.playing ? 'Pause' : 'Play';
    this.panel.status(`Frame ${this.sprite.currentFrame + 1}/${this.frames.length} | ${this.sprite.playing ? 'Playing' : 'Paused'}`);
  }

  override draw(context: RenderingContext): void {
    context.render(this.root);
  }

  override destroy(): void {
    this.panel?.dispose();
    super.destroy();
  }
}

const app = new Application({
  scenes: { FrameAnimationScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(239, 244, 227),
});

await startExample(app, () => app.start(FrameAnimationScene));
