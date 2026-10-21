import {
  Application,
  Color,
  FixedResolutionCanvasSizing,
  Graphics,
  type RenderingContext,
  Scene,
  type Seconds,
  Sprite,
  Text,
  type Texture,
} from '@codexo/exojs';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';

// Three copies of one sprite, each turning about a different origin. The red dot
// is the sprite's position, which is always where its origin sits; the cyan box
// is its world-space bounds.
const VARIANTS = [
  { title: 'Origin at the top-left corner', anchor: [0, 0], origin: null },
  { title: 'Origin at the centre', anchor: [0.5, 0.5], origin: null },
  { title: 'Origin outside the texture', anchor: [0.5, 0.5], origin: [110, -20] },
] as const;

const SCALE = 1.5;

class PivotAndAnchorScene extends Scene {
  private readonly sprites: Sprite[] = [];
  private readonly labels: Text[] = [];
  private readonly overlay = new Graphics();
  private ship!: Texture;

  // The anchor derives the origin from the texture size, so the texture is
  // awaited rather than claimed as a placeholder that is still 0 x 0.
  override async load(): Promise<void> {
    this.ship = await this.loader.load(assets.ship);
  }

  override init(): void {
    const { width, height } = this.app;
    const column = width / VARIANTS.length;

    VARIANTS.forEach((variant, index) => {
      const x = column * (index + 0.5);
      const sprite = new Sprite(this.ship).setScale(SCALE).setPosition(x, height / 2);

      sprite.setAnchor(variant.anchor[0], variant.anchor[1]);

      if (variant.origin) {
        sprite.setOrigin(variant.origin[0], variant.origin[1]);
      }

      this.sprites.push(sprite);
      this.labels.push(
        new Text(variant.title, { fillColor: Color.white, fontSize: 18, align: 'center' }).setAnchor(0.5, 0).setPosition(x, 40),
      );
    });
  }

  override update(delta: Seconds): void {
    for (const sprite of this.sprites) {
      sprite.rotate(delta * 45);
    }
  }

  override draw(context: RenderingContext): void {
    this.overlay.clear();
    this.overlay.lineColor = new Color(110, 215, 245);
    this.overlay.lineWidth = 2;

    for (const sprite of this.sprites) {
      const bounds = sprite.getBounds();

      context.render(sprite);
      this.overlay.fillColor = Color.transparent;
      this.overlay.drawRectangle(bounds.x, bounds.y, bounds.width, bounds.height);
      this.overlay.fillColor = new Color(255, 80, 80);
      this.overlay.drawCircle(sprite.x, sprite.y, 6);
    }

    context.render(this.overlay);

    for (const label of this.labels) {
      context.render(label);
    }
  }
}

const app = new Application({
  scenes: { PivotAndAnchorScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
});

await app.start(PivotAndAnchorScene);
