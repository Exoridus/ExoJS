import { assets } from '@assets';
import { Application, BitmapText, BmFont, Color, Scene } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: new Color(20, 24, 36),
});

document.body.append(app.canvas);

class BitmapTextBasicScene extends Scene {
    private font!: BmFont;
    private title!: BitmapText;
    private info!: BitmapText;
    private wrapped!: BitmapText;
    private counter!: BitmapText;
    private frame = 0;

    override async load(loader): Promise<void> {
        this.font = await loader.load(BmFont, assets.demo.fonts.kenneyBlocksFnt);
    }

    override init(): void {
        const font = this.font;

        this.title = new BitmapText('BITMAP TEXT', font, { scale: 1.5 });
        this.title.tint = new Color(255, 220, 80);
        this.title.setPosition(80, 70);

        this.info = new BitmapText('AngelCode .fnt   no Canvas 2D rasterisation', font);
        this.info.setPosition(80, 180);

        this.wrapped = new BitmapText(
            'Word wrap, per-glyph kerning, and all standard ASCII chars are supported.',
            font,
            { scale: 0.85, layout: { maxWidth: 620 } },
        );
        this.wrapped.setPosition(80, 270);

        this.counter = new BitmapText('Frame: 0', font);
        this.counter.tint = new Color(160, 210, 160);
        this.counter.setPosition(80, 500);
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
