import { fonts } from '@assets';
import { Application, BitmapText, BmFont, Color, Scene } from '@codexo/exojs';

// Kenney Blocks — CC0 bitmap font, 32 px, AngelCode .fnt format.
// The .fnt loader resolves the page texture automatically from the same URL.

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: new Color(20, 24, 36),
});

document.body.append(app.canvas);

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(BmFont, { blocks: fonts.kenneyBlocksFnt });
        }
        init(loader) {
            const font = loader.get(BmFont, 'blocks');

            // Title — 1.5× scale
            this._title = new BitmapText('BITMAP TEXT', font, { scale: 1.5 });
            this._title.tint = new Color(255, 220, 80);
            this._title.setPosition(80, 70);

            // Subtitle — native scale
            this._info = new BitmapText('AngelCode .fnt   no Canvas 2D rasterisation', font);
            this._info.setPosition(80, 180);

            // Word-wrapped paragraph
            this._wrapped = new BitmapText(
                'Word wrap, per-glyph kerning, and all standard ASCII chars are supported.',
                font,
                { scale: 0.85, layout: { maxWidth: 620 } },
            );
            this._wrapped.setPosition(80, 270);

            // Live counter — demonstrates cheap text updates
            this._counter = new BitmapText('Frame: 0', font);
            this._counter.tint = new Color(160, 210, 160);
            this._counter.setPosition(80, 500);

            this._frame = 0;
        }
        update() {
            this._counter.text = `Frame: ${++this._frame}`;
        }
        draw(context) {
            context.backend.clear();
            context.render(this._title);
            context.render(this._info);
            context.render(this._wrapped);
            context.render(this._counter);
        }
    })(),
);
