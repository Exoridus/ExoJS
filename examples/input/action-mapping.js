import { Application, Color, GamepadAxis, GamepadButton, Keyboard, Scene, Sprite, Texture } from '@codexo/exojs';

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
            this._sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setPosition(400, 300);
            this._keys = { a: 0, d: 0, w: 0, s: 0 };
            this._stick = { x: 0, y: 0 };
            this._jumpImpulse = 0;

            const pad0 = this.app.input.getGamepad(0);
            this.inputs.onActive(Keyboard.A, () => {
                this._keys.a = 1;
            });
            this.inputs.onStop(Keyboard.A, () => {
                this._keys.a = 0;
            });
            this.inputs.onActive(Keyboard.D, () => {
                this._keys.d = 1;
            });
            this.inputs.onStop(Keyboard.D, () => {
                this._keys.d = 0;
            });
            this.inputs.onActive(Keyboard.W, () => {
                this._keys.w = 1;
            });
            this.inputs.onStop(Keyboard.W, () => {
                this._keys.w = 0;
            });
            this.inputs.onActive(Keyboard.S, () => {
                this._keys.s = 1;
            });
            this.inputs.onStop(Keyboard.S, () => {
                this._keys.s = 0;
            });
            this.inputs.onTrigger(Keyboard.Space, () => {
                this._jumpImpulse = -220;
            });
            pad0.onTrigger(GamepadButton.South, () => {
                this._jumpImpulse = -220;
            });
            pad0.onActive(GamepadAxis.LeftStickX, value => {
                this._stick.x = value;
            });
            pad0.onStop(GamepadAxis.LeftStickX, () => {
                this._stick.x = 0;
            });
            pad0.onActive(GamepadAxis.LeftStickY, value => {
                this._stick.y = value;
            });
            pad0.onStop(GamepadAxis.LeftStickY, () => {
                this._stick.y = 0;
            });
        }
        update(delta) {
            const keyX = this._keys.d - this._keys.a;
            const keyY = this._keys.s - this._keys.w;
            const moveX = Math.abs(this._stick.x) > Math.abs(keyX) ? this._stick.x : keyX;
            const moveY = Math.abs(this._stick.y) > Math.abs(keyY) ? this._stick.y : keyY;

            this._sprite.move(moveX * 260 * delta.seconds, moveY * 260 * delta.seconds);
            this._sprite.move(0, this._jumpImpulse * delta.seconds);
            this._jumpImpulse = Math.min(0, this._jumpImpulse + 800 * delta.seconds);
        }
        draw(context) {
            context.backend.clear();
            context.render(this._sprite);
        }
    })()
);
