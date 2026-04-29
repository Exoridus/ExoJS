import { Application, Color, Scene, Sprite, Texture } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

app.start(new class extends Scene {

    async load(loader) {
        await loader.load(Texture, { bunny: 'image/bunny.png' });
    }
    init(loader) {
        const { width, height } = this.app.canvas;

        this._bunny = new Sprite(loader.get(Texture, 'bunny'));
        this._bunny.setPosition(width / 2 | 0, height / 2 | 0);
        this._bunny.setAnchor(0.5);
    }
    update(delta) {
        this._bunny.rotate(delta.seconds * 360);
    }
    draw(backend) {
        backend.clear();
        this._bunny.render(backend);
    }
});
