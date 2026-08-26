import { Application, Color, FixedResolutionCanvasSizing, Graphics, Rectangle, type RenderingContext, Scene, type Seconds, Sprite } from '@codexo/exojs';

const ALPHA_RINGS = assets.technical.alpha.alphaGradientRings;

class MasksScene extends Scene {
  private rectSprite!: Sprite;
  private rectMask!: Rectangle;
  private gfxSprite!: Sprite;
  private time = 0;

  override init(): void {
    const app = this.app;
    const { width, height } = app;
    const tex = this.loader.get(ALPHA_RINGS);

    this.rectSprite = new Sprite(tex);
    this.rectSprite.setScale(1);
    this.rectSprite.setPosition((width / 4) | 0, (height / 2) | 0);
    this.rectSprite.setAnchor(0.5);
    this.rectMask = new Rectangle(0, 0, 110, 110);
    this.rectSprite.mask = this.rectMask;

    const circle = new Graphics();
    circle.fillColor = Color.white;
    circle.drawCircle(0, 0, 72);

    this.gfxSprite = new Sprite(tex);
    this.gfxSprite.setScale(1);
    this.gfxSprite.setPosition(((width * 3) / 4) | 0, (height / 2) | 0);
    this.gfxSprite.setAnchor(0.5);
    this.gfxSprite.mask = circle;
  }

  override update(delta: Seconds): void {
    const app = this.app;
    const { width, height } = app;
    this.time += delta;

    const r = 80;
    this.rectMask.x = (width / 4 + Math.cos(this.time * 1.4) * r - 55) | 0;
    this.rectMask.y = (height / 2 + Math.sin(this.time * 1.4) * r - 55) | 0;
  }

  override draw(context: RenderingContext): void {
    context.render(this.rectSprite);
    context.render(this.gfxSprite);
  }
}

const app = new Application({
  scenes: { MasksScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
});

app.start(MasksScene);
