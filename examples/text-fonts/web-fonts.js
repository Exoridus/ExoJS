// Auto-generated from web-fonts.ts — edit the .ts source, not this file.
import { Application, Color, FontAsset, Scene, Text } from '@codexo/exojs';
const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});
class WebFontsScene extends Scene {
    default;
    loaded;
    async load(loader) {
        await loader.load(FontAsset, { andy: 'font/Kenney Future.ttf' }, { family: 'Kenney Future' });
    }
    init() {
        const { width, height } = this.app.canvas;
        this.default = new Text('Default Font', { fillColor: Color.white, fontSize: 52, align: 'center' });
        this.default.setAnchor(0.5, 0.5);
        this.default.setPosition(width / 2, height / 2 - 60);
        this.loaded = new Text('Kenney Future Font', { fillColor: Color.white, fontFamily: 'Kenney Future', fontSize: 52, align: 'center' });
        this.loaded.setAnchor(0.5, 0.5);
        this.loaded.setPosition(width / 2, height / 2 + 60);
    }
    draw(context) {
        context.backend.clear();
        context.render(this.default);
        context.render(this.loaded);
    }
}
app.start(new WebFontsScene());
