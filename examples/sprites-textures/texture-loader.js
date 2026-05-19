import { Application, Color, Graphics, Scene, Sprite, Text, Texture } from '@codexo/exojs';

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
            const loading = loader.load(Texture, {
                bunny:   'image/bunny.png',
                rainbow: 'image/rainbow.png',
                uv:      'image/uv.png',
            });

            loading.onProgress.add((progress) => {
                this._progress = progress;
            });

            await loading;
        }
        init(loader) {
            const { width, height } = this.app.canvas;
            const textures = [loader.get(Texture, 'bunny'), loader.get(Texture, 'rainbow'), loader.get(Texture, 'uv')];

            this._sprites = textures.map((texture, index) => {
                const sprite = new Sprite(texture);
                sprite.setAnchor(0.5);
                sprite.setPosition(200 + index * 200, height * 0.55);
                return sprite;
            });

            this._bar = new Graphics();
            this._label = new Text('', { fill: 'white', fontSize: 18 });
            this._label.setPosition(300, 190);
            this._width = width;
            this._progress = { loaded: 0, total: 3 };
        }
        draw(backend) {
            backend.clear();
            const { loaded, total } = this._progress;
            this._bar.clear();
            this._bar.fillColor = new Color(60, 60, 60);
            this._bar.drawRectangle(200, 150, 400, 24);
            this._bar.fillColor = new Color(90, 220, 120);
            this._bar.drawRectangle(200, 150, total > 0 ? (400 * loaded) / total : 0, 24);
            this._bar.render(backend);
            this._label.setText(`Loaded ${loaded} / ${total}`);
            this._label.render(backend);

            for (const sprite of this._sprites) {
                sprite.render(backend);
            }
        }
    })()
);
