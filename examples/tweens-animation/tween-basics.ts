import { Application, Color, FixedResolutionCanvasSizing, Graphics, Keyboard, type RenderingContext, Scene, Sprite, Tween } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';

class InteractiveTweensScene extends Scene {
  private sprite!: Sprite;
  private target!: Graphics;
  private hud!: ReturnType<typeof mountControls>;
  private moveTween: Tween | null = null;
  private roundTrip = false;
  private readonly onPointerDown = (_pointer: unknown, x: number, y: number): void => this.moveTo(x, y);

  override init(): void {
    const { width, height } = this.app;
    this.sprite = new Sprite(this.loader.get('image/ship-a.png')).setAnchor(0.5).setPosition(width / 2, height / 2);
    this.target = new Graphics();
    this.hud = mountControls({
      title: 'Interactive Tweens',
      controls: [
        { keys: 'Click', action: 'move to target; click again to interrupt' },
        { keys: 'Space', action: 'toggle round trip' },
      ],
      hint: 'A new tween starts from the current position. Round trip uses repeat(1) with yoyo().',
    });
    this.updateHud('Ready');
    this.app.input.onPointerDown.add(this.onPointerDown);
    this.inputs.onTrigger(Keyboard.Space, () => {
      this.roundTrip = !this.roundTrip;
      this.updateHud('Ready');
    });
  }

  private moveTo(x: number, y: number): void {
    this.moveTween?.stop();
    this.target.clear();
    this.target.lineWidth = 2;
    this.target.lineColor = new Color(120, 220, 255);
    this.target.drawCircle(x, y, 24);
    this.moveTween = this.app.tweens
      .create(this.sprite.position)
      .to({ x, y }, 0.7)
      .repeat(this.roundTrip ? 1 : 0)
      .yoyo(this.roundTrip)
      .onComplete(() => this.updateHud('Complete'))
      .start();
    this.updateHud('Moving');
  }

  private updateHud(state: string): void {
    this.hud.setStatus(`${state} · ${this.roundTrip ? 'round trip' : 'one way'}`);
  }

  override draw(context: RenderingContext): void {
    context.render(this.target);
    context.render(this.sprite);
  }

  override destroy(): void {
    this.moveTween?.stop();
    this.app.input.onPointerDown.remove(this.onPointerDown);
    this.hud.dispose();
    super.destroy();
  }
}

const app = new Application({
  scenes: { InteractiveTweensScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
  loader: { basePath: 'assets/' },
});

await app.start(InteractiveTweensScene);
