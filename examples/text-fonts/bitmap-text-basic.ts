import { fonts } from '@assets';
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
    private _font!: BmFont;
    private _title!: BitmapText;
    private _info!: BitmapText;
    private _wrapped!: BitmapText;
    private _counter!: BitmapText;
    private _frame = 0;

    override async load(loader): Promise<void> {
        this._font = await loader.load(BmFont, fonts.kenneyBlocksFnt);
    }

    override init(): void {
        const font = this._font;

        this._title = new BitmapText('BITMAP TEXT', font, { scale: 1.5 });
        this._title.tint = new Color(255, 220, 80);
        this._title.setPosition(80, 70);

        this._info = new BitmapText('AngelCode .fnt   no Canvas 2D rasterisation', font);
        this._info.setPosition(80, 180);

        this._wrapped = new BitmapText(
            'Word wrap, per-glyph kerning, and all standard ASCII chars are supported.',
            font,
            { scale: 0.85, layout: { maxWidth: 620 } },
        );
        this._wrapped.setPosition(80, 270);

        this._counter = new BitmapText('Frame: 0', font);
        this._counter.tint = new Color(160, 210, 160);
        this._counter.setPosition(80, 500);
    }

    override update(): void {
        this._counter.text = `Frame: ${++this._frame}`;
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._title);
        context.render(this._info);
        context.render(this._wrapped);
        context.render(this._counter);
    }
}

app.start(new BitmapTextBasicScene());
