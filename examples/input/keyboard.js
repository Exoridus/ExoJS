import { Application, Color, Keyboard, Scene, Sprite, Texture } from '@codexo/exojs';

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
            this._sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setPosition(400, 300);
            this._move = { w: 0, a: 0, s: 0, d: 0 };

            this.inputs.onActive(Keyboard.W, () => {
                this._move.w = 1;
            });
            this.inputs.onStop(Keyboard.W, () => {
                this._move.w = 0;
            });
            this.inputs.onActive(Keyboard.A, () => {
                this._move.a = 1;
            });
            this.inputs.onStop(Keyboard.A, () => {
                this._move.a = 0;
            });
            this.inputs.onActive(Keyboard.S, () => {
                this._move.s = 1;
            });
            this.inputs.onStop(Keyboard.S, () => {
                this._move.s = 0;
            });
            this.inputs.onActive(Keyboard.D, () => {
                this._move.d = 1;
            });
            this.inputs.onStop(Keyboard.D, () => {
                this._move.d = 0;
            });
            this.inputs.onTrigger(Keyboard.Escape, () => {
                this._sprite.setPosition(400, 300);
            });
        }
        update(delta) {
            const speed = 280 * delta.seconds;
            this._sprite.move((this._move.d - this._move.a) * speed, (this._move.s - this._move.w) * speed);
        }
        draw(backend) {
            backend.clear();
            this._sprite.render(backend);
        }
    })()
);
