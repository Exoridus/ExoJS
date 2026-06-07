// Auto-generated from web-fonts.ts — edit the .ts source, not this file.
import { Application, Color, FontAsset, Scene, Text } from '@codexo/exojs';
const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});
document.body.append(app.canvas);
class WebFontsScene extends Scene {
    default;
    loaded;
    async load(loader) {
        await loader.load(FontAsset, { andy: 'font/Kenney Future.ttf' }, { family: 'Kenney Future' });
    }
    init() {
        this.default = new Text('Default Font', { fillColor: Color.white, fontSize: 52 });
        this.default.setPosition(120, 200);
        this.loaded = new Text('Kenney Future Font', { fillColor: Color.white, fontFamily: 'Kenney Future', fontSize: 52 });
        this.loaded.setPosition(120, 320);
    }
    draw(context) {
        context.backend.clear();
        context.render(this.default);
        context.render(this.loaded);
    }
}
app.start(new WebFontsScene());
