import { Application, Color, Container, FixedResolutionCanvasSizing, Graphics, type RenderingContext, Scene, type Seconds } from '@codexo/exojs';

class GraphicsPrimitivesScene extends Scene {
  private sceneRoot!: Container;
  private panel!: Graphics;
  private circle!: Graphics;
  private diamond!: Graphics;
  private star!: Graphics;

  override init(): void {
    const app = this.app;
    const { width, height } = app;

    this.sceneRoot = new Container();
    this.sceneRoot.setPosition(width / 2, height / 2);

    this.panel = new Graphics();
    this.panel.fillColor = Color.darkSlateBlue;
    this.panel.drawRectangle(-190, -130, 380, 260);

    this.circle = new Graphics();
    this.circle.fillColor = Color.tomato;
    this.circle.drawCircle(-92, -6, 48);

    this.diamond = new Graphics();
    this.diamond.fillColor = Color.goldenrod;
    this.diamond.drawPolygon([0, -70, 70, 0, 0, 70, -70, 0]);

    this.star = new Graphics();
    this.star.fillColor = Color.mediumSeaGreen;
    this.star.drawStar(108, 12, 5, 58, 26, -18);

    this.sceneRoot.addChild(this.panel, this.circle, this.diamond, this.star);
  }

  override update(delta: Seconds): void {
    const app = this.app;
    this.sceneRoot.rotate(delta * 9);
    this.star.rotate(delta * 60);
    this.circle.y = Math.sin(app.activeSeconds * 2) * 18;
  }

  override draw(context: RenderingContext): void {
    context.render(this.sceneRoot);
  }

  override destroy(): void {
    this.sceneRoot?.destroy();
  }
}

const app = new Application({
  scenes: { GraphicsPrimitivesScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.midnightBlue,
  backend: { type: 'webgpu' },
});

app.start(GraphicsPrimitivesScene).catch(() => {
  app.element?.remove();
  void app.destroy();
});
