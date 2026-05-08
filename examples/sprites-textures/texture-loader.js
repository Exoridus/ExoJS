import { Application, Color, Graphics, Scene, Sprite, Text, Texture } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

app.start(
    new (class extends Scene {
        async load(loader) {
            this._progress = 0;
            loader.onLoaded.add(() => {
                this._progress += 1;
            });
            await loader.load(Texture, {
                bunny: 'image/bunny.png',
                rainbow: 'image/rainbow.png',
                uv: 'image/uv.png',
            });
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
            this._label = new Text('Loaded 3 / 3', { fill: 'white', fontSize: 18 });
            this._label.setPosition(300, 190);
            this._width = width;
        }
        draw(backend) {
            backend.clear();
            this._bar.clear();
            this._bar.fillColor = new Color(60, 60, 60);
            this._bar.drawRectangle(200, 150, 400, 24);
            this._bar.fillColor = new Color(90, 220, 120);
            this._bar.drawRectangle(200, 150, (400 * this._progress) / 3, 24);
            this._bar.render(backend);
            this._label.render(backend);

            for (const sprite of this._sprites) {
                sprite.render(backend);
            }
        }
    })()
);
