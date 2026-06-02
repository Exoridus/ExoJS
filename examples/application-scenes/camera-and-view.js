import { Application, Color, Graphics, Keyboard, Scene, Text, View } from '@codexo/exojs';

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
        init() {
            const { width, height } = this.app.canvas;

            this._camera = new View(0, 0, width, height);
            this._world = new Graphics();
            this._world.lineWidth = 2;
            this._world.lineColor = Color.darkGray;

            for (let x = -1200; x <= 1200; x += 120) {
                this._world.drawLine(x, -900, x, 900);
            }
            for (let y = -900; y <= 900; y += 120) {
                this._world.drawLine(-1200, y, 1200, y);
            }

            this._overlay = new Text('WASD pan, Q/E zoom', { fillColor: Color.white, fontSize: 16 });
            this._overlay.setPosition(12, 12);

            this._moveX = 0;
            this._moveY = 0;
            this._zoom = 0;
            this.inputs.onActive(Keyboard.A, () => {
                this._moveX = -1;
            });
            this.inputs.onStop(Keyboard.A, () => {
                if (this._moveX < 0) this._moveX = 0;
            });
            this.inputs.onActive(Keyboard.D, () => {
                this._moveX = 1;
            });
            this.inputs.onStop(Keyboard.D, () => {
                if (this._moveX > 0) this._moveX = 0;
            });
            this.inputs.onActive(Keyboard.W, () => {
                this._moveY = -1;
            });
            this.inputs.onStop(Keyboard.W, () => {
                if (this._moveY < 0) this._moveY = 0;
            });
            this.inputs.onActive(Keyboard.S, () => {
                this._moveY = 1;
            });
            this.inputs.onStop(Keyboard.S, () => {
                if (this._moveY > 0) this._moveY = 0;
            });
            this.inputs.onActive(Keyboard.Q, () => {
                this._zoom = 1;
            });
            this.inputs.onStop(Keyboard.Q, () => {
                if (this._zoom > 0) this._zoom = 0;
            });
            this.inputs.onActive(Keyboard.E, () => {
                this._zoom = -1;
            });
            this.inputs.onStop(Keyboard.E, () => {
                if (this._zoom < 0) this._zoom = 0;
            });
        }
        update(delta) {
            this._camera.move(this._moveX * 420 * delta.seconds, this._moveY * 420 * delta.seconds);
            this._camera.setZoom(Math.max(0.25, this._camera.zoomLevel + this._zoom * 0.75 * delta.seconds));
        }
        draw(context) {
            context.backend.clear();
            context.backend.setView(this._camera);
            context.render(this._world);
            context.backend.setView(null);
            context.render(this._overlay);
        }
    })()
);
