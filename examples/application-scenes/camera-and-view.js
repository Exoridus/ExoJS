// Auto-generated from camera-and-view.ts — edit the .ts source, not this file.
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
class CameraViewScene extends Scene {
    camera;
    world;
    overlay;
    moveX = 0;
    moveY = 0;
    zoom = 0;
    init() {
        const { width, height } = this.app.canvas;
        this.camera = new View(0, 0, width, height);
        this.world = new Graphics();
        this.world.lineWidth = 2;
        this.world.lineColor = Color.darkGray;
        for (let x = -1200; x <= 1200; x += 120) {
            this.world.drawLine(x, -900, x, 900);
        }
        for (let y = -900; y <= 900; y += 120) {
            this.world.drawLine(-1200, y, 1200, y);
        }
        this.overlay = new Text('WASD pan, Q/E zoom', { fillColor: Color.white, fontSize: 16 });
        this.overlay.setPosition(12, 12);
        this.inputs.onActive(Keyboard.A, () => {
            this.moveX = -1;
        });
        this.inputs.onStop(Keyboard.A, () => {
            if (this.moveX < 0)
                this.moveX = 0;
        });
        this.inputs.onActive(Keyboard.D, () => {
            this.moveX = 1;
        });
        this.inputs.onStop(Keyboard.D, () => {
            if (this.moveX > 0)
                this.moveX = 0;
        });
        this.inputs.onActive(Keyboard.W, () => {
            this.moveY = -1;
        });
        this.inputs.onStop(Keyboard.W, () => {
            if (this.moveY < 0)
                this.moveY = 0;
        });
        this.inputs.onActive(Keyboard.S, () => {
            this.moveY = 1;
        });
        this.inputs.onStop(Keyboard.S, () => {
            if (this.moveY > 0)
                this.moveY = 0;
        });
        this.inputs.onActive(Keyboard.Q, () => {
            this.zoom = 1;
        });
        this.inputs.onStop(Keyboard.Q, () => {
            if (this.zoom > 0)
                this.zoom = 0;
        });
        this.inputs.onActive(Keyboard.E, () => {
            this.zoom = -1;
        });
        this.inputs.onStop(Keyboard.E, () => {
            if (this.zoom < 0)
                this.zoom = 0;
        });
    }
    update(delta) {
        this.camera.move(this.moveX * 420 * delta.seconds, this.moveY * 420 * delta.seconds);
        this.camera.setZoom(Math.max(0.25, this.camera.zoomLevel + this.zoom * 0.75 * delta.seconds));
    }
    draw(context) {
        context.backend.clear();
        context.backend.setView(this.camera);
        context.render(this.world);
        context.backend.setView(null);
        context.render(this.overlay);
    }
}
app.start(new CameraViewScene());
