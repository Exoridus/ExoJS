import {
  Application,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  Graphics,
  type RenderingContext,
  RenderNodePass,
  RenderPipeline,
  RenderTexture,
  Scene,
  type Seconds,
  Sprite,
  View,
} from '@codexo/exojs';

class MiniMapScene extends Scene {
  private worldContainer!: Container;
  private world!: Graphics;
  private player!: Graphics;
  private miniWorld!: Graphics;
  private miniPlayer!: Graphics;
  private miniContent!: Container;
  private miniRt!: RenderTexture;
  private miniSprite!: Sprite;
  private miniFrame!: Graphics;
  private miniMask!: Graphics;
  private overlay!: Container;
  private miniView!: View;
  private pipeline!: RenderPipeline;
  private time = 0;

  override init(): void {
    const app = this.app;
    const { width } = app;
    const miniX = width - 220 - 20;
    const miniY = 20;

    this.worldContainer = new Container();
    this.world = new Graphics();
    this.player = new Graphics();
    this.worldContainer.addChild(this.world);
    this.worldContainer.addChild(this.player);
    this.miniContent = new Container();
    this.miniWorld = new Graphics();
    this.miniPlayer = new Graphics();
    this.miniContent.addChild(this.miniWorld);
    this.miniContent.addChild(this.miniPlayer);

    this.miniRt = new RenderTexture(220, 160);
    this.miniSprite = new Sprite(this.miniRt).setPosition(miniX, miniY);
    this.miniMask = new Graphics();
    this.miniMask.fillColor = Color.white;
    this.miniMask.drawCircle(miniX + 110, miniY + 80, 76);
    this.miniSprite.mask = this.miniMask;
    this.miniFrame = new Graphics();
    this.miniFrame.lineWidth = 2;
    this.miniFrame.lineColor = Color.white;
    this.miniFrame.drawCircle(miniX + 110, miniY + 80, 76);

    this.overlay = new Container();
    this.overlay.addChild(this.miniSprite);
    this.overlay.addChild(this.miniFrame);

    this.miniView = new View(110, 80, 220, 160);

    // The render-target pass owns its clear; a manual backend clear here would clear the canvas instead.
    this.pipeline = new RenderPipeline()
      .addPass(new RenderNodePass(this.miniContent, { target: this.miniRt, view: this.miniView, clear: Color.black }))
      .addPass(new RenderNodePass(this.worldContainer, { clear: Color.black }))
      .addPass(new RenderNodePass(this.overlay));
  }

  override update(delta: Seconds): void {
    const app = this.app;
    const { width, height } = app;
    const marginX = 80;
    const marginY = 60;

    this.time += delta;

    this.world.clear();
    this.world.fillColor = new Color(50, 90, 160);
    this.world.drawRectangle(marginX, marginY, width - 2 * marginX, height - 2 * marginY);
    this.world.lineWidth = 2;
    this.world.lineColor = new Color(60, 70, 90);
    for (let x = marginX; x <= width - marginX; x += 80) this.world.drawLine(x, marginY, x, height - marginY);
    for (let y = marginY; y <= height - marginY; y += 80) this.world.drawLine(marginX, y, width - marginX, y);

    const px = width / 2 + Math.cos(this.time) * (width * 0.4);
    const py = height / 2 + Math.sin(this.time * 1.3) * (height * 0.4);
    this.player.clear();
    this.player.fillColor = new Color(255, 180, 100);
    this.player.drawCircle(px, py, 18);

    this.miniWorld.clear();
    this.miniWorld.fillColor = new Color(50, 90, 160);
    this.miniWorld.drawRectangle(0, 0, 220, 160);
    this.miniWorld.lineWidth = 1;
    this.miniWorld.lineColor = new Color(150, 185, 230);
    for (let x = 0; x <= 220; x += 20) this.miniWorld.drawLine(x, 0, x, 160);
    for (let y = 0; y <= 160; y += 20) this.miniWorld.drawLine(0, y, 220, y);
    this.miniPlayer.clear();
    this.miniPlayer.fillColor = new Color(255, 180, 100);
    const markerX = (px / width) * 220 - 110;
    const markerY = (py / height) * 160 - 80;
    const markerScale = Math.min(1, 65 / Math.hypot(markerX, markerY));
    this.miniPlayer.drawCircle(110 + markerX * markerScale, 80 + markerY * markerScale, 5);
  }

  override draw(context: RenderingContext): void {
    this.pipeline.execute(context);
  }

  override destroy(): void {
    // Pipeline cascades destroy() to its passes; the caller-owned target/view it created are freed here.
    this.pipeline.destroy();
    this.miniRt.destroy();
    this.miniView.destroy();
    super.destroy();
  }
}

const app = new Application({
  scenes: { MiniMapScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
  loader: {
    basePath: 'assets/',
  },
});

await app.start(MiniMapScene);
