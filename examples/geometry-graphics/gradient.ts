import {
  Application,
  Color,
  FixedResolutionCanvasSizing,
  LinearGradient,
  RadialGradient,
  type RenderingContext,
  Scene,
  Sprite,
  type Seconds,
} from '@codexo/exojs';

class GradientScene extends Scene {
  private backgroundGradient!: LinearGradient;
  private background!: Sprite;
  private orbGradient!: RadialGradient;
  private orb!: Sprite;

  override init(): void {
    const app = this.app;
    const centerX = app.width / 2;
    const centerY = app.height / 2;

    this.backgroundGradient = new LinearGradient(
      [
        { offset: 0, color: new Color(255, 90, 40, 1) },
        { offset: 0.45, color: new Color(255, 210, 70, 1) },
        { offset: 1, color: new Color(70, 90, 255, 1) },
      ],
      [0, 0],
      [1, 1],
    );
    this.background = new Sprite(this.backgroundGradient.toTexture(760, 360));
    this.background.setOrigin(0.5).setPosition(centerX, centerY);

    this.orbGradient = new RadialGradient(
      [
        { offset: 0, color: new Color(255, 255, 255, 1) },
        { offset: 0.35, color: new Color(100, 220, 255, 0.8) },
        { offset: 1, color: new Color(20, 40, 90, 0.1) },
      ],
      [0.5, 0.5],
      0.5,
    );
    this.orb = new Sprite(this.orbGradient.toTexture(180, 180));
    this.orb.setOrigin(0.5).setPosition(centerX, centerY);
  }

  override update(delta: Seconds): void {
    const app = this.app;
    this.background.rotate(delta * 8);
    this.orb.rotate(-delta * 30);
    this.orb.setScale(1 + Math.sin(app.activeSeconds * 2) * 0.07);
  }

  override draw(context: RenderingContext): void {
    context.render(this.background);
    context.render(this.orb);
  }

  override destroy(): void {
    this.background?.texture?.destroy();
    this.orb?.texture?.destroy();
    this.background?.destroy();
    this.orb?.destroy();
    this.backgroundGradient?.destroy();
    this.orbGradient?.destroy();
  }
}

const app = new Application({
  scenes: { GradientScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
  backend: { type: 'webgl2' },
});

app.start(GradientScene).catch(() => {
  app.element?.remove();
  app.destroy();
});
