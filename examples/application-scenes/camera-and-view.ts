import { Application, Color, Graphics, Keyboard, type RenderingContext, Scene, Text, type Time, View } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});

class CameraViewScene extends Scene {
    private camera!: View;
    private world!: Graphics;
    private overlay!: Text;
    private moveX = 0;
    private moveY = 0;
    private zoom = 0;

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

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
            if (this.moveX < 0) this.moveX = 0;
        });
        this.inputs.onActive(Keyboard.D, () => {
            this.moveX = 1;
        });
        this.inputs.onStop(Keyboard.D, () => {
            if (this.moveX > 0) this.moveX = 0;
        });
        this.inputs.onActive(Keyboard.W, () => {
            this.moveY = -1;
        });
        this.inputs.onStop(Keyboard.W, () => {
            if (this.moveY < 0) this.moveY = 0;
        });
        this.inputs.onActive(Keyboard.S, () => {
            this.moveY = 1;
        });
        this.inputs.onStop(Keyboard.S, () => {
            if (this.moveY > 0) this.moveY = 0;
        });
        this.inputs.onActive(Keyboard.Q, () => {
            this.zoom = 1;
        });
        this.inputs.onStop(Keyboard.Q, () => {
            if (this.zoom > 0) this.zoom = 0;
        });
        this.inputs.onActive(Keyboard.E, () => {
            this.zoom = -1;
        });
        this.inputs.onStop(Keyboard.E, () => {
            if (this.zoom < 0) this.zoom = 0;
        });
    }

    override update(delta: Time): void {
        this.camera.move(this.moveX * 420 * delta.seconds, this.moveY * 420 * delta.seconds);
        this.camera.setZoom(Math.max(0.25, this.camera.zoomLevel + this.zoom * 0.75 * delta.seconds));
    }

    override draw(context: RenderingContext): void {
        context.clear(Color.black);
        context.render(this.world, { view: this.camera });
        context.render(this.overlay, { view: context.screenView });
    }
}

app.start(new CameraViewScene());
