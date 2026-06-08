// Auto-generated from bitmap-text-basic.ts — edit the .ts source, not this file.
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
    font;
    title;
    info;
    wrapped;
    counter;
    frame = 0;
    async load(loader) {
        this.font = await loader.load(BmFont, assets.demo.fonts.kenneyBlocksFnt);
    }
    init() {
        const font = this.font;
        this.title = new BitmapText('BITMAP TEXT', font, { scale: 1.5 });
        this.title.tint = new Color(255, 220, 80);
        this.title.setPosition(80, 70);
        this.info = new BitmapText('AngelCode .fnt   no Canvas 2D rasterisation', font);
        this.info.setPosition(80, 180);
        this.wrapped = new BitmapText('Word wrap, per-glyph kerning, and all standard ASCII chars are supported.', font, { scale: 0.85, layout: { maxWidth: 620 } });
        this.wrapped.setPosition(80, 270);
        this.counter = new BitmapText('Frame: 0', font);
        this.counter.tint = new Color(160, 210, 160);
        this.counter.setPosition(80, 500);
    }
    update() {
        this.counter.text = `Frame: ${++this.frame}`;
    }
    draw(context) {
        context.backend.clear();
        context.render(this.title);
        context.render(this.info);
        context.render(this.wrapped);
        context.render(this.counter);
    }
}
app.start(new BitmapTextBasicScene());
