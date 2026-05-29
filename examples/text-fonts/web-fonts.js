import { Application, Color, Scene, Text } from '@codexo/exojs';

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

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(FontFace, { andy: 'font/AndyBold.woff2' }, { family: 'AndyBold' });
        }
        init() {
            this._default = new Text('Default Font', { fill: 'white', fontSize: 52 });
            this._default.setPosition(120, 200);
            this._loaded = new Text('AndyBold Font', { fill: 'white', fontFamily: 'AndyBold', fontSize: 52 });
            this._loaded.setPosition(120, 320);
        }
        draw(context) {
            context.backend.clear();
            context.render(this._default);
            context.render(this._loaded);
        }
    })()
);
