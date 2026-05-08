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
            this._sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setPosition(400, 300);
            this.app.tweens.create(this._sprite.scale).to({ x: 1.5, y: 1.5 }, 0.8).yoyo(true).repeat(-1).start();
            this.app.tweens.create(this._sprite).to({ rotation: 20 }, 0.8).yoyo(true).repeat(-1).start();
        }
        draw(backend) {
            backend.clear();
            this._sprite.render(backend);
        }
    })()
);
