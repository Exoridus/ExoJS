import { Application, Color, Ease, FixedResolutionCanvasSizing, Graphics, Keyboard, type RenderingContext, Scene, type Seconds, Sprite } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';

// Every built-in Ease function, in source order.
const EASINGS: [string, (t: number) => number][] = [
  ['linear', Ease.linear],
  ['quadIn', Ease.quadIn],
  ['quadOut', Ease.quadOut],
  ['quadInOut', Ease.quadInOut],
  ['cubicIn', Ease.cubicIn],
  ['cubicOut', Ease.cubicOut],
  ['cubicInOut', Ease.cubicInOut],
  ['quartIn', Ease.quartIn],
  ['quartOut', Ease.quartOut],
  ['quartInOut', Ease.quartInOut],
  ['quintIn', Ease.quintIn],
  ['quintOut', Ease.quintOut],
  ['quintInOut', Ease.quintInOut],
  ['sineIn', Ease.sineIn],
  ['sineOut', Ease.sineOut],
  ['sineInOut', Ease.sineInOut],
  ['expoIn', Ease.expoIn],
  ['expoOut', Ease.expoOut],
  ['expoInOut', Ease.expoInOut],
  ['circIn', Ease.circIn],
  ['circOut', Ease.circOut],
  ['circInOut', Ease.circInOut],
  ['backIn', Ease.backIn],
  ['backOut', Ease.backOut],
  ['backInOut', Ease.backInOut],
  ['bounceIn', Ease.bounceIn],
  ['bounceOut', Ease.bounceOut],
  ['bounceInOut', Ease.bounceInOut],
  ['elasticIn', Ease.elasticIn],
  ['elasticOut', Ease.elasticOut],
  ['elasticInOut', Ease.elasticInOut],
];

const SAMPLES = 80;
const V_MIN = -0.45;
const V_MAX = 1.45;

class EasingCurvesScene extends Scene {
  private graphics = new Graphics();
  private sprite!: Sprite;
  private hud!: ReturnType<typeof mountControls>;
  private selected = 0;
  private t = 0;
  private direction = 1;
  private readonly onTap = (pointer: { x: number }): void => this.select(pointer.x < this.app.width / 2 ? -1 : 1);

  override init(): void {
    this.sprite = new Sprite(this.loader.get('image/ship-a.png')).setAnchor(0.5).setScale(2);
    this.inputs.onTrigger(Keyboard.Left, () => this.select(-1));
    this.inputs.onTrigger(Keyboard.Right, () => this.select(1));
    this.app.input.onPointerTap.add(this.onTap);
    this.hud = mountControls({
      title: 'Easing Explorer',
      controls: [
        { keys: 'Left / Right', action: 'select a curve' },
        { keys: 'Click left / right half', action: 'select a curve' },
      ],
      status: '',
      hint: 'The ship moves along the selected easing curve. Overshoot remains visible above and below the 0–1 range.',
    });
    this.refreshHud();
  }

  private select(direction: number): void {
    this.selected = (this.selected + direction + EASINGS.length) % EASINGS.length;
    this.refreshHud();
  }

  private refreshHud(): void {
    this.hud.setStatus(`${this.selected + 1} / ${EASINGS.length} · ${EASINGS[this.selected][0]}`);
  }

  override update(delta: Seconds): void {
    this.t += this.direction * delta * 0.6;

    if (this.t >= 1) {
      this.t = 1;
      this.direction = -1;
    } else if (this.t <= 0) {
      this.t = 0;
      this.direction = 1;
    }
  }

  override draw(context: RenderingContext): void {
    const { width, height } = this.app;
    const left = width * 0.12;
    const right = width * 0.88;
    const top = height * 0.14;
    const bottom = height * 0.9;
    const plotY = (value: number): number => bottom - ((value - V_MIN) / (V_MAX - V_MIN)) * (bottom - top);
    const ease = EASINGS[this.selected][1];
    const g = this.graphics;

    g.clear();
    g.lineWidth = 2;
    g.lineColor = new Color(72, 86, 110);
    g.drawLine(left, plotY(0), right, plotY(0));
    g.drawLine(left, plotY(1), right, plotY(1));
    g.drawLine(left, top, left, bottom);

    g.lineWidth = 4;
    g.lineColor = new Color(90, 210, 255);
    for (let sample = 1; sample <= SAMPLES; sample++) {
      const previous = (sample - 1) / SAMPLES;
      const current = sample / SAMPLES;
      g.drawLine(left + previous * (right - left), plotY(ease(previous)), left + current * (right - left), plotY(ease(current)));
    }

    this.sprite.setPosition(left + this.t * (right - left), plotY(ease(this.t)));
    context.render(g);
    context.render(this.sprite);
  }

  override destroy(): void {
    this.app.input.onPointerTap.remove(this.onTap);
    this.hud.dispose();
    super.destroy();
  }
}

const app = new Application({
  scenes: { EasingCurvesScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(18, 21, 30),
  loader: { basePath: 'assets/' },
});

await app.start(EasingCurvesScene);
