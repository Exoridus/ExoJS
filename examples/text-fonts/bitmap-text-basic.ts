import { Application, BitmapText, BmFont, Color, Scene } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: new Color(20, 24, 36),
});

class BitmapTextBasicScene extends Scene {
    private font!: BmFont;
    private title!: BitmapText;
    private info!: BitmapText;
    private wrapped!: BitmapText;
    private counter!: BitmapText;
    private frame = 0;

    override async load(loader): Promise<void> {
        this.font = await loader.load(BmFont.of(assets.demo.fonts.kenneyBlocksFnt));
    }

    override init(): void {
        const font = this.font;
        const { width, height } = this.app.canvas;
        const marginX = width * 0.08;

        this.title = new BitmapText('BITMAP TEXT', font, { scale: 1.5 });
        this.title.tint = new Color(255, 220, 80);
        this.title.setPosition(marginX, height * 0.12);

        this.info = new BitmapText('AngelCode .fnt   no Canvas 2D rasterisation', font);
        this.info.setPosition(marginX, height * 0.32);

        this.wrapped = new BitmapText(
            'Word wrap, per-glyph kerning, and all standard ASCII chars are supported.',
            font,
            { scale: 0.85, layout: { maxWidth: 760 } },
        );
        this.wrapped.setPosition(marginX, height * 0.46);

        this.counter = new BitmapText('Frame: 0', font);
        this.counter.tint = new Color(160, 210, 160);
        this.counter.setPosition(marginX, height * 0.82);
    }

    override update(): void {
        this.counter.text = `Frame: ${++this.frame}`;
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.title);
        context.render(this.info);
        context.render(this.wrapped);
        context.render(this.counter);
    }
}

app.start(new BitmapTextBasicScene());
