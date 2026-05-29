import { Application, Color, Scene, Sprite, Texture } from '@codexo/exojs';

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
            await loader.load(Texture, { bunny: 'image/ship-a.png' });
        }
        init(loader) {
            const { width, height } = this.app.canvas;

            this._bunny = new Sprite(loader.get(Texture, 'bunny'));
            this._bunny.setPosition((width / 2) | 0, (height / 2) | 0);
            this._bunny.setAnchor(0.5);
            this._tints = [new Color(255, 120, 120), new Color(120, 255, 160), new Color(120, 180, 255)];
            this._tintIndex = 0;
            this._tintTime = 0;
            this._bunny.setTint(this._tints[this._tintIndex]);
        }
        update(delta) {
            this._bunny.rotate(delta.seconds * 360);
            this._tintTime += delta.seconds;

            if (this._tintTime >= 0.5) {
                this._tintTime = 0;
                this._tintIndex = (this._tintIndex + 1) % this._tints.length;
                this._bunny.setTint(this._tints[this._tintIndex]);
            }
        }
        draw(context) {
            context.backend.clear();
            context.render(this._bunny);
        }
    })()
);
