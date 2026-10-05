import { Application, Color, Ease, FixedResolutionCanvasSizing, Graphics, type RenderingContext, Scene, Sprite, Tween } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';

const WAYPOINTS = [
  { x: 0.2, y: 0.3 },
  { x: 0.8, y: 0.3 },
  { x: 0.8, y: 0.72 },
  { x: 0.2, y: 0.72 },
];

class TweenSequencesScene extends Scene {
  private sprite!: Sprite;
  private path!: Graphics;
  private steps: Tween[] = [];
  private hud!: ReturnType<typeof mountControls>;

  override init(): void {
    const points = WAYPOINTS.map(point => ({ x: point.x * this.app.width, y: point.y * this.app.height }));
    this.path = new Graphics();
    this.path.lineWidth = 3;
    this.path.lineColor = new Color(60, 100, 150);
    for (let i = 0; i < points.length; i++) {
      const next = points[(i + 1) % points.length];
      this.path.drawLine(points[i].x, points[i].y, next.x, next.y);
    }

    this.sprite = new Sprite(this.loader.get('image/ship-a.png')).setAnchor(0.5).setPosition(points[0].x, points[0].y);
    this.hud = mountControls({
      title: 'Tween Sequences',
      status: 'Leg 1 / 4',
      hint: 'Four tweens are chained once, then the final completion restarts the sequence.',
    });

    this.steps = points
      .slice(1)
      .concat(points[0])
      .map((point, index) =>
        this.app.tweens
          .create(this.sprite.position)
          .to(point, 0.75)
          .easing(Ease.sineInOut)
          .onStart(() => this.hud.setStatus(`Leg ${index + 1} / ${points.length}`)),
      );
    for (let i = 0; i < this.steps.length - 1; i++) {
      this.steps[i].chain(this.steps[i + 1]);
    }
    this.steps.at(-1)!.onComplete(() => this.steps[0].start());
    this.steps[0].start();
  }

  override draw(context: RenderingContext): void {
    context.render(this.path);
    context.render(this.sprite);
  }

  override destroy(): void {
    this.steps.forEach(tween => tween.stop());
    this.hud.dispose();
    super.destroy();
  }
}

const app = new Application({
  scenes: { TweenSequencesScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: Color.black,
  loader: { basePath: 'assets/' },
});

await app.start(TweenSequencesScene);
