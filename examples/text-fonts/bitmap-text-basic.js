// Auto-generated from bitmap-text-basic.ts — edit the .ts source, not this file.
import { Asset } from '@codexo/exojs';
import { Application, BitmapText, Color, Scene } from '@codexo/exojs';
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
    font;
    title;
    info;
    wrapped;
    counter;
    frame = 0;
    async load(loader) {
        this.font = await loader.load(Asset.kind('bmFont', assets.demo.fonts.kenneyBlocksFnt));
    }
    init() {
        const font = this.font;
        const { width, height } = this.app.canvas;
        const marginX = width * 0.08;
        this.title = new BitmapText('BITMAP TEXT', font, { scale: 1.5 });
        this.title.tint = new Color(255, 220, 80);
        this.title.setPosition(marginX, height * 0.12);
        this.info = new BitmapText('AngelCode .fnt   no Canvas 2D rasterisation', font);
        this.info.setPosition(marginX, height * 0.32);
        this.wrapped = new BitmapText('Word wrap, per-glyph kerning, and all standard ASCII chars are supported.', font, { scale: 0.85, layout: { maxWidth: 760 } });
        this.wrapped.setPosition(marginX, height * 0.46);
        this.counter = new BitmapText('Frame: 0', font);
        this.counter.tint = new Color(160, 210, 160);
        this.counter.setPosition(marginX, height * 0.82);
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
