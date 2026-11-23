import {
  ActionMap,
  Application,
  ButtonAction,
  Color,
  Ease,
  Graphics,
  Keyboard,
  type RenderingContext,
  ResponsiveCanvasSizing,
  Scene,
  SceneAvailability,
  SceneState,
  type Sprite,
  Spritesheet,
  Text,
  type Tween,
  TweenState,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { choice, demoPanel, startExample } from '@examples/runtime';

const controls = {
  easing: choice('Ease', Object.keys(Ease) as Array<keyof typeof Ease>, 'sineInOut'),
  mode: choice('Mode', ['One-way', 'Roundtrip', 'Route']),
};

class InteractiveTweensScene extends Scene {
  private sprite!: Sprite;
  private readonly graphics = this.track(new Graphics());
  private readonly marks = this.track(new Graphics());
  private plotKey = '';
  private readonly labels = ['Choose a target', 'Time / value'].map(text =>
    this.track(new Text(text, { fillColor: new Color(35, 63, 59) })),
  );
  private panel!: ReturnType<typeof demoPanel<typeof controls>>;
  private readonly actions = new ActionMap({
    previous: new ButtonAction(Keyboard.Left),
    next: new ButtonAction(Keyboard.Right),
    pause: new ButtonAction(Keyboard.Space),
  });
  private readonly position = { x: 0.5, y: 0.5 };
  private readonly clock = { t: 0 };
  private steps: Tween[] = [];
  private motionPaused = false;
  private moving = false;
  private leg = 0;
  private target = { x: 0.5, y: 0.5 };
  private bounds = { x: 0, y: 0, width: 1, height: 1 };
  private readonly onPointerDown = (_pointer: unknown, x: number, y: number): void => {
    if (this.state !== SceneState.Active) {
      return;
    }

    const box = this.bounds;

    if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height) {
      this.moveTo((x - box.x) / box.width, (y - box.y) / box.height);
    }
  };

  override async load(): Promise<void> {
    const [texture, data] = await Promise.all([
      this.loader.load(assets.platformerCharactersImage),
      this.loader.load(assets.platformerCharactersAtlas),
    ]);

    if (this.lifecycleSignal.aborted) {
      return;
    }

    const sheet = new Spritesheet(texture, data);

    this.track({
      destroy: () => {
        sheet.clear();
      },
    });

    this.sprite = this.track(sheet.getFrameSprite('character_green_idle').setAnchor(0.5));
  }

  override init(): void {
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      controls,
      actions: { 'Pause / Resume': () => this.pause() },
      onChange: () => this.stop(),
    });
    this.inputs.attach(this.actions);
    this.app.input.onPointerDown.add(this.onPointerDown);
  }

  private stop(): void {
    this.steps.forEach(tween => tween.stop());
    this.steps = [];
    this.moving = false;
    // Replacing motion or changing controls settles an interrupted overshoot
    // at the nearest target edge. Pause/Resume keeps its exact value.
    this.position.x = Math.max(0, Math.min(1, this.position.x));
    this.position.y = Math.max(0, Math.min(1, this.position.y));
  }

  private moveTo(x: number, y: number): void {
    this.stop();
    const start = { ...this.position };
    const points = [{ x, y }];

    if (this.panel.values.mode === 'Roundtrip') {
      points.push(start);
    } else if (this.panel.values.mode === 'Route') {
      points.push({ x: 0.85, y: 0.2 }, { x: 0.85, y: 0.8 }, start);
    }

    const ease = Ease[this.panel.values.easing];
    const legs = points.map((point, index) =>
      this.tweens
        .create(this.position, { when: SceneAvailability.Active })
        .to(point, 0.9)
        .easing(t => {
          this.clock.t = t;

          return ease(t);
        })
        .onStart(() => {
          this.leg = index + 1;
          this.target = point;
          this.clock.t = 0;
        }),
    );

    for (let index = 0; index < legs.length - 1; index++) {
      legs[index]!.chain(legs[index + 1]!);
    }

    legs.at(-1)!.onComplete(() => {
      this.moving = false;
    });
    this.steps = [...legs];
    this.moving = true;
    legs[0]!.start();

    if (this.motionPaused) {
      legs[0]!.pause();
    }
  }

  private pause(): void {
    this.motionPaused = !this.motionPaused;
    this.steps.forEach(tween => {
      if (tween.state === (this.motionPaused ? TweenState.Active : TweenState.Paused)) {
        if (this.motionPaused) {
          tween.pause();
        } else {
          tween.resume();
        }
      }
    });
  }

  override update(): void {
    if (this.actions.previous.pressed) {
      this.panel.step('easing', -1);
    }

    if (this.actions.next.pressed) {
      this.panel.step('easing');
    }

    if (this.actions.pause.pressed) {
      this.pause();
    }

    const { scale: k, width, contentHeight } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    this.app.rendering.view.setCenter(this.app.width / 2, this.app.height / 2);
    const w = width * k;
    const h = contentHeight * k;
    let g = this.graphics;
    const left = w * 0.66;
    const right = w - 24 * k;
    const top = 38 * k;
    const bottom = h - 20 * k;
    const plotY = (value: number): number => bottom - ((value + 0.45) / 1.9) * (bottom - top);
    const ease = Ease[this.panel.values.easing];

    const plotKey = `${w}/${h}/${k}/${this.panel.values.easing}`;

    if (plotKey !== this.plotKey) {
      this.plotKey = plotKey;
      const arenaWidth = Math.max(k, w * 0.58 - 32 * k);
      const arenaHeight = Math.max(k, h - 52 * k);
      const frame = this.sprite.getLocalBounds();
      this.sprite.setScale(Math.min(0.65 * k, (arenaWidth * 0.5) / frame.width, (arenaHeight * 0.5) / frame.height));

      // Fit the complete sprite, including the selected easing's overshoot.
      // A small sampling margin keeps elastic extrema away from the edges.
      let overshoot = 0.01;

      for (let sample = 0; sample <= 128; sample++) {
        const value = ease(sample / 128);
        overshoot = Math.max(overshoot, -value + 0.01, value - 1 + 0.01);
      }

      const travelWidth = (arenaWidth - this.sprite.width) / (1 + 2 * overshoot);
      const travelHeight = (arenaHeight - this.sprite.height) / (1 + 2 * overshoot);
      this.bounds = {
        x: 16 * k + this.sprite.width / 2 + overshoot * travelWidth,
        y: 40 * k + this.sprite.height / 2 + overshoot * travelHeight,
        width: travelWidth,
        height: travelHeight,
      };
      g.clear();
      g.lineWidth = 2 * k;
      g.lineColor = new Color(168, 175, 181);
      g.drawRectangle(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height);
      g.drawLine(left, plotY(0), right, plotY(0));
      g.drawLine(left, plotY(1), right, plotY(1));
      g.drawLine(left, top, left, bottom);
      g.lineColor = new Color(35, 100, 60);

      for (let sample = 1; sample <= 64; sample++) {
        g.drawLine(
          left + ((sample - 1) / 64) * (right - left),
          plotY(ease((sample - 1) / 64)),
          left + (sample / 64) * (right - left),
          plotY(ease(sample / 64)),
        );
      }
    }

    g = this.marks;
    g.clear();
    g.lineWidth = 2 * k;
    g.fillColor = new Color(101, 210, 210);
    g.drawCircle(left + this.clock.t * (right - left), plotY(ease(this.clock.t)), 5 * k);
    g.fillColor = new Color(0, 0, 0, 0);
    g.lineColor = new Color(35, 100, 60);
    g.drawCircle(this.bounds.x + this.target.x * this.bounds.width, this.bounds.y + this.target.y * this.bounds.height, 10 * k);
    this.sprite.setPosition(this.bounds.x + this.position.x * this.bounds.width, this.bounds.y + this.position.y * this.bounds.height);
    this.labels.forEach((label, index) => {
      label.style.fontSize = 14 * k;
      label.setPosition(index ? left : 24 * k, 12 * k);
    });
    this.panel.status(
      `${this.motionPaused ? 'Paused' : this.moving ? 'Moving' : 'Ready'} | Leg ${this.leg} | t ${this.clock.t.toFixed(2)} / ${ease(this.clock.t).toFixed(2)}`,
    );
  }

  override draw(context: RenderingContext): void {
    context.render(this.graphics);
    context.render(this.marks);
    context.render(this.sprite);
    this.labels.forEach(label => context.render(label));
  }

  override destroy(): void {
    this.app.input.onPointerDown.remove(this.onPointerDown);
  }
}

const app = new Application({
  scenes: { InteractiveTweensScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new ResponsiveCanvasSizing({ minAspect: 1 }) },
  clearColor: new Color(239, 244, 227),
});

await startExample(app, () => app.start(InteractiveTweensScene));
