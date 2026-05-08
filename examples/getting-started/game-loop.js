import { Application, Color, Scene, Sprite, Texture } from '@codexo/exojs';

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
            await loader.load(Texture, { bunny: 'image/bunny.png' });
        }
        init(loader) {
            const { width, height } = this.app.canvas;

            this._sprite = new Sprite(loader.get(Texture, 'bunny'));
            this._sprite.setAnchor(0.5);
            this._sprite.setPosition(width / 2, height / 2);
        }
        update(delta) {
            this._sprite.rotate(delta.seconds * 120);
        }
        draw(backend) {
            backend.clear();
            this._sprite.render(backend);
        }
    })()
);
