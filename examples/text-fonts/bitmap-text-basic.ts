import { Application, Asset, BitmapText, BmFont, Color, FixedResolutionCanvasSizing, type RenderingContext, Scene } from '@codexo/exojs';

class BitmapTextBasicScene extends Scene {
  private font!: BmFont;
  private title!: BitmapText;
  private info!: BitmapText;
  private wrapped!: BitmapText;
  private counter!: BitmapText;
  private frame = 0;

  override async load(): Promise<void> {
    const app = this.app;
    this.font = await this.loader.load(Asset.type('bmFont', assets.demo.fonts.kenneyBlocksFnt));

    const font = this.font;
    const { width, height } = app;
    const marginX = width * 0.08;

    this.title = new BitmapText('BITMAP TEXT', font, { scale: 1.5 });
    this.title.tint = new Color(255, 220, 80);
    this.title.setPosition(marginX, height * 0.12);

    this.info = new BitmapText('AngelCode .fnt   no Canvas 2D rasterisation', font);
    this.info.setPosition(marginX, height * 0.32);

    this.wrapped = new BitmapText('Word wrap, per-glyph kerning, and all standard ASCII chars are supported.', font, {
      scale: 0.85,
      layout: { maxWidth: 760 },
    });
    this.wrapped.setPosition(marginX, height * 0.46);

    this.counter = new BitmapText('Frame: 0', font);
    this.counter.tint = new Color(160, 210, 160);
    this.counter.setPosition(marginX, height * 0.82);
  }

  override update(): void {
    this.counter.text = `Frame: ${++this.frame}`;
  }

  override draw(context: RenderingContext): void {
    context.render(this.title);
    context.render(this.info);
    context.render(this.wrapped);
    context.render(this.counter);
  }
}

const app = new Application({
  scenes: { BitmapTextBasicScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(20, 24, 36),
});

await app.start(BitmapTextBasicScene);
