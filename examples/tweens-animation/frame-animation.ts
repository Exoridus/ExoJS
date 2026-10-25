import {
  ActionMap,
  AnimatedSprite,
  Application,
  ButtonAction,
  Color,
  FixedResolutionCanvasSizing,
  Graphics,
  Keyboard,
  Rectangle,
  type RenderingContext,
  Scene,
  type Seconds,
  Text,
  Texture,
  Time,
} from '@codexo/exojs';
import { demoPanel, slider, startExample } from '@examples/runtime';

const FRAME_COUNT = 8;
const REFERENCE_FPS = 8;

class FrameAnimationScene extends Scene {
  private clips: AnimatedSprite[] = [];
  private labels: Text[] = [];
  private readonly frames = Array.from({ length: FRAME_COUNT }, (_, index) => new Rectangle(index * 96, 0, 96, 96));
  private readonly marks = this.track(new Graphics());
  private readonly actions = new ActionMap({
    pause: new ButtonAction(Keyboard.Space),
    reset: new ButtonAction(Keyboard.R),
    slower: new ButtonAction(Keyboard.Left),
    faster: new ButtonAction(Keyboard.Right),
  });
  private panel!: ReturnType<typeof demoPanel<{ fps: ReturnType<typeof slider> }>>;
  private playing = true;
  private clipTime = 0;

  override init(): void {
    const sheet = document.createElement('canvas');

    sheet.width = 96 * FRAME_COUNT;
    sheet.height = 96;
    const paint = sheet.getContext('2d')!;

    for (let frame = 0; frame < FRAME_COUNT; frame++) {
      const lift = Math.sin((frame / FRAME_COUNT) * Math.PI) * 24;
      const x = frame * 96;

      paint.fillStyle = '#233f3b';
      paint.beginPath();
      paint.roundRect(x + 22, 32 - lift, 52, 48, 12);
      paint.fill();
      paint.fillStyle = '#88e97e';
      paint.beginPath();
      paint.roundRect(x + 26, 36 - lift, 44, 40, 9);
      paint.fill();
      paint.fillStyle = '#233f3b';
      paint.fillRect(x + 35, 45 - lift, 5, 7);
      paint.fillRect(x + 56, 45 - lift, 5, 7);
      paint.fillRect(x + 29, 78 - lift, 12, 5);
      paint.fillRect(x + 55, 78 - lift, 12, 5);
    }

    const texture = this.track(new Texture(sheet));

    this.clips = [REFERENCE_FPS, REFERENCE_FPS].map(fps =>
      this.track(new AnimatedSprite(texture, { bounce: { frames: this.frames, fps } }).setAnchor(0.5, 1).play('bounce')),
    );
    this.labels = this.clips.map(() => this.track(new Text('', { fillColor: new Color(35, 63, 59), align: 'center' })).setAnchor(0.5, 0));
    this.panel = demoPanel({
      title: 'Sprite Animation',
      layout: 'bar',
      controls: { fps: slider('Your fps', { min: 1, max: 24, step: 1, value: REFERENCE_FPS, format: value => `${value} fps` }) },
      actions: { 'Pause / Resume': () => this.pause(), '+0.1 s': () => this.step(), Reset: () => this.reset() },
      onChange: (_key, fps) => this.clips[1]!.addClip('bounce', { frames: this.frames, fps }),
    });
    this.inputs.attach(this.actions);
  }

  private pause(): void {
    this.playing = !this.playing;
  }

  private advance(delta: Seconds): void {
    this.clipTime += delta;

    // Immediate-mode sprites have no AnimationSystem owner; both receive exactly the same clip time.
    for (const clip of this.clips) {
      clip.resume();
      clip.update(delta);
      clip.pause();
    }
  }

  private step(): void {
    if (!this.playing) {
      this.advance(Time.seconds(0.1));
    }
  }

  private reset(): void {
    this.clipTime = 0;
    this.panel.set('fps', REFERENCE_FPS);
    this.clips.forEach(clip => clip.play('bounce').pause());
  }

  override update(delta: Seconds): void {
    if (this.actions.pause.pressed) {
      this.pause();
    }

    if (this.actions.reset.pressed) {
      this.reset();
    }

    if (this.actions.slower.pressed) {
      this.panel.step('fps', -1);
    }

    if (this.actions.faster.pressed) {
      this.panel.step('fps');
    }

    if (this.playing) {
      this.advance(delta);
    }

    const { scale: k, height, compact } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    const panel = this.panel.element;

    panel.querySelector<HTMLButtonElement>('button:nth-of-type(2)')!.disabled = this.playing;
    panel.querySelector<HTMLButtonElement>('button')!.setAttribute('aria-pressed', String(!this.playing));
    this.panel.status(
      `${this.playing ? 'Playing' : 'Paused'} | Clip time ${this.clipTime.toFixed(1)} s${compact ? '' : ' | Space pause, arrows tempo, R reset'}`,
    );
    const ground = (height - panel.offsetHeight - 68) * k;
    const size = Math.min(320, Math.max(80, ground / k - 12));

    this.marks.clear();
    this.marks.lineColor = new Color(134, 155, 141);
    this.marks.lineWidth = 2 * k;
    this.marks.moveTo(24 * k, ground).lineTo(this.app.width - 24 * k, ground);

    this.clips.forEach((clip, index) => {
      const x = this.app.width * (index === 0 ? 0.27 : 0.73);

      clip.setPosition(x, ground).setScale((size * k) / 96);
      const label = this.labels[index]!;

      label.style.fontSize = 15 * k;
      label.text = `${index === 0 ? 'Reference' : 'Your clip'} | ${index === 0 ? REFERENCE_FPS : this.panel.values.fps} fps\nFrame ${clip.currentFrame + 1}/${FRAME_COUNT}`;
      label.setPosition(x, ground + 8 * k);

      for (let frame = 0; frame < FRAME_COUNT; frame++) {
        this.marks.fillColor = frame === clip.currentFrame ? new Color(35, 100, 60) : new Color(196, 208, 194);
        this.marks.drawRectangle(x + (frame - 4) * 14 * k, ground + 50 * k, 10 * k, 5 * k);
      }
    });
  }

  override draw(context: RenderingContext): void {
    context.render(this.marks);
    this.clips.forEach(clip => context.render(clip));
    this.labels.forEach(label => context.render(label));
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
