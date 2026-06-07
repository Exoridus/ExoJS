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
    private default!: Text;
    private loaded!: Text;

    override async load(loader): Promise<void> {
        await loader.load(FontAsset, { andy: 'font/Kenney Future.ttf' }, { family: 'Kenney Future' });
    }

    override init(): void {
        this.default = new Text('Default Font', { fillColor: Color.white, fontSize: 52 });
        this.default.setPosition(120, 200);
        this.loaded = new Text('Kenney Future Font', { fillColor: Color.white, fontFamily: 'Kenney Future', fontSize: 52 });
        this.loaded.setPosition(120, 320);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.default);
        context.render(this.loaded);
    }
}

app.start(new WebFontsScene());
