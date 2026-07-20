// Auto-generated from web-fonts.ts — edit the .ts source, not this file.
import { Application, Asset, Color, Scene, Text } from '@codexo/exojs';
class WebFontsScene extends Scene {
    default;
    loaded;
    async init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        await this.loader.load(Asset.kind('font', 'font/Kenney Future.ttf', { family: 'Kenney Future' }));
        const { width, height } = app.canvas;
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
const app = new Application({
    scenes: { WebFontsScene },
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
app.start(WebFontsScene);
