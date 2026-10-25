import {
  Application,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  Keyboard,
  Rectangle,
  type RenderingContext,
  RenderTexture,
  Scene,
  type Seconds,
  Sprite,
  Text,
  type Texture,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, startExample } from '@examples/runtime';

class RenderToTextureScene extends Scene {
  private readonly source = this.track(new Container());
  private texture!: Texture;
  private readonly liveTarget = this.track(new RenderTexture(320, 240));
  private readonly target = this.track(new RenderTexture(320, 240));
  private live!: Sprite;
  private snapshot!: Sprite;
  private figures: Sprite[] = [];
  private labels: Text[] = [];
  private panel!: ReturnType<typeof demoPanel<Record<string, never>>>;
  private captureRequested = true;
  private captureCount = 0;
  private capturedTime = 0;
  private time = 0;
  private playing = true;

  override async load(): Promise<void> {
    this.texture = await this.loader.load(assets.platformerTilesImage);
  }

  override init(): void {
    for (let i = 0; i < 6; i++) {
      const figure = new Sprite(this.texture)
        .setTextureFrame(new Rectangle(650, 325, 64, 64))
        .setAnchor(0.5)
        .setScale(0.9)
        .setPosition(60 + (i % 3) * 100, 70 + Math.floor(i / 3) * 100);
      this.figures.push(figure);
      this.source.addChild(figure);
    }

    this.live = new Sprite(this.liveTarget);
    this.snapshot = new Sprite(this.target);
    this.labels = ['Live source', 'Frozen capture'].map(text =>
      new Text(text, { fillColor: Color.white, fontSize: 14, align: 'center' }).setAnchor(0.5),
    );
    this.root.addChild(this.live, this.snapshot, ...this.labels);
    this.panel = demoPanel({
      scene: this,
      title: 'Capture a Texture',
      layout: 'bar',
      controls: {},
      hint: 'Click / Space captures once. The scene owns both render textures until it ends.',
      actions: {
        Capture: () => this.capture(),
        'Pause / Resume': () => {
          this.playing = !this.playing;
        },
        Reset: () => {
          this.time = 0;
          this.captureCount = 0;
          this.capture();
        },
      },
    });
    this.inputs.onTrigger(Keyboard.Space, () => this.capture());
    this.inputs.onTrigger(Keyboard.R, () => {
      this.time = 0;
      this.captureCount = 0;
      this.capture();
    });
    this.app.input.onPointerTap.add(this.onTap);
  }

  private capture(): void {
    this.captureRequested = true;
  }

  private readonly onTap = (): void => this.capture();

  override update(delta: Seconds): void {
    if (this.playing) {
      this.time += delta;
    }

    this.figures.forEach((figure, index) => (figure.rotation = this.time * (30 + index * 12)));
    const { scale, width, contentHeight } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    this.root.setScale(scale);
    const size = Math.min(width * 0.43, ((contentHeight - 44) * 4) / 3);

    for (const [index, sprite] of [this.live, this.snapshot].entries()) {
      sprite.width = size;
      sprite.height = size * 0.75;
      sprite.setPosition(width * (index === 0 ? 0.25 : 0.75) - size / 2, (contentHeight - size * 0.75) / 2 + 12);
      this.labels[index].setPosition(width * (index === 0 ? 0.25 : 0.75), 16);
    }

    this.panel.status(
      `Live ${this.time.toFixed(1)}s | capture #${this.captureCount} at ${this.capturedTime.toFixed(1)}s | ${this.playing ? 'running' : 'paused'}`,
    );
  }

  override draw(context: RenderingContext): void {
    if (this.texture.ready) {
      context.renderTo(this.source, { target: this.liveTarget, clear: new Color(40, 54, 62) });

      if (this.captureRequested) {
        context.renderTo(this.source, { target: this.target, clear: new Color(40, 54, 62) });
        this.captureRequested = false;
        this.capturedTime = this.time;
        this.captureCount++;
      }
    }

    context.render(this.root);
  }

  override destroy(): void {
    this.app.input.onPointerTap.remove(this.onTap);
    this.panel.dispose();
    super.destroy();
  }
}

const app = new Application({
  scenes: { RenderToTextureScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(20, 27, 34),
});
await startExample(app, () => app.start(RenderToTextureScene));
