import { Application, Color, Keyboard, Scene, Sprite, Text, Texture } from '@codexo/exojs';

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
            await loader.load(Texture, { bunny: 'image/bunny.png' });
        }
        init(loader) {
            const { width, height } = this.app.canvas;

            this._paused = false;
            this._sprite = new Sprite(loader.get(Texture, 'bunny'));
            this._sprite.setAnchor(0.5);
            this._sprite.setPosition(width / 2, height / 2);
            this._label = new Text('Space: pause update', { fill: 'white', fontSize: 16, padding: 8 });
            this._label.setAnchor(0.5, 0);
            this._label.setPosition(width / 2, 16);
            this.inputs.onTrigger(Keyboard.Space, () => {
                this._paused = !this._paused;
                this._label.setText(this._paused ? 'Paused (draw running)' : 'Running');
            });
        }
        update(delta) {
            if (this._paused) {
                return;
            }

            this._sprite.rotate(delta.seconds * 180);
        }
        draw(backend) {
            backend.clear();
            this._sprite.render(backend);
            this._label.render(backend);
        }
    })()
);
