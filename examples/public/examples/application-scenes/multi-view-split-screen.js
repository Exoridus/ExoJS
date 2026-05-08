import { Application, Color, Graphics, Keyboard, Scene, Sprite, Texture, View } from '@codexo/exojs';

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

            this._leftView = new View(0, 0, width / 2, height);
            this._leftView.viewport.set(0, 0, 0.5, 1);
            this._rightView = new View(0, 0, width / 2, height);
            this._rightView.viewport.set(0.5, 0, 0.5, 1);
            this._divider = new Graphics();
            this._divider.fillColor = Color.white;
            this._divider.drawRectangle(width / 2 - 1, 0, 2, height);

            this._leftPlayer = new Sprite(loader.get(Texture, 'bunny'))
                .setAnchor(0.5)
                .setPosition(-160, 0)
                .setTint(new Color(120, 190, 255));
            this._rightPlayer = new Sprite(loader.get(Texture, 'bunny'))
                .setAnchor(0.5)
                .setPosition(160, 0)
                .setTint(new Color(255, 180, 120));
            this._move = { a: 0, d: 0, w: 0, s: 0, left: 0, right: 0, up: 0, down: 0 };

            this.inputs.onActive(Keyboard.A, () => {
                this._move.a = 1;
            });
            this.inputs.onStop(Keyboard.A, () => {
                this._move.a = 0;
            });
            this.inputs.onActive(Keyboard.D, () => {
                this._move.d = 1;
            });
            this.inputs.onStop(Keyboard.D, () => {
                this._move.d = 0;
            });
            this.inputs.onActive(Keyboard.W, () => {
                this._move.w = 1;
            });
            this.inputs.onStop(Keyboard.W, () => {
                this._move.w = 0;
            });
            this.inputs.onActive(Keyboard.S, () => {
                this._move.s = 1;
            });
            this.inputs.onStop(Keyboard.S, () => {
                this._move.s = 0;
            });
            this.inputs.onActive(Keyboard.Left, () => {
                this._move.left = 1;
            });
            this.inputs.onStop(Keyboard.Left, () => {
                this._move.left = 0;
            });
            this.inputs.onActive(Keyboard.Right, () => {
                this._move.right = 1;
            });
            this.inputs.onStop(Keyboard.Right, () => {
                this._move.right = 0;
            });
            this.inputs.onActive(Keyboard.Up, () => {
                this._move.up = 1;
            });
            this.inputs.onStop(Keyboard.Up, () => {
                this._move.up = 0;
            });
            this.inputs.onActive(Keyboard.Down, () => {
                this._move.down = 1;
            });
            this.inputs.onStop(Keyboard.Down, () => {
                this._move.down = 0;
            });
        }
        update(delta) {
            const speed = 300 * delta.seconds;
            this._leftPlayer.move((this._move.d - this._move.a) * speed, (this._move.s - this._move.w) * speed);
            this._rightPlayer.move((this._move.right - this._move.left) * speed, (this._move.down - this._move.up) * speed);
            this._leftView.setCenter(this._leftPlayer.position.x, this._leftPlayer.position.y);
            this._rightView.setCenter(this._rightPlayer.position.x, this._rightPlayer.position.y);
        }
        draw(backend) {
            backend.clear();
            backend.setView(this._leftView);
            this._leftPlayer.render(backend);
            this._rightPlayer.render(backend);
            backend.setView(this._rightView);
            this._leftPlayer.render(backend);
            this._rightPlayer.render(backend);
            backend.setView(null);
            this._divider.render(backend);
        }
    })()
);
