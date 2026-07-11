import { Application, Asset, Color, type RenderingContext, Scene, Text } from '@codexo/exojs';

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
    private default!: Text;
    private loaded!: Text;

    override async init(): Promise<void> {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        await this.loader.load(Asset.kind('font', 'font/Kenney Future.ttf', { family: 'Kenney Future' }));

        const { width, height } = app.canvas;

        this.default = new Text('Default Font', { fillColor: Color.white, fontSize: 52, align: 'center' });
        this.default.setAnchor(0.5, 0.5);
        this.default.setPosition(width / 2, height / 2 - 60);
        this.loaded = new Text('Kenney Future Font', { fillColor: Color.white, fontFamily: 'Kenney Future', fontSize: 52, align: 'center' });
        this.loaded.setAnchor(0.5, 0.5);
        this.loaded.setPosition(width / 2, height / 2 + 60);
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.default);
        context.render(this.loaded);
    }
}

app.start(new WebFontsScene());
