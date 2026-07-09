// Auto-generated from multi-view-split-screen.ts — edit the .ts source, not this file.
import { Application, Color, Graphics, Keyboard, Scene, Sprite, View } from '@codexo/exojs';
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
class SplitScreenScene extends Scene {
    texture;
    leftView;
    rightView;
    divider;
    leftPlayer;
    rightPlayer;
    move = {
        a: 0,
        d: 0,
        w: 0,
        s: 0,
        left: 0,
        right: 0,
        up: 0,
        down: 0,
    };
    async load(loader) {
        this.texture = await loader.load('image/ship-a.png');
    }
    init() {
        const { width, height } = this.app.canvas;
        this.leftView = new View(0, 0, width / 2, height).setViewport(0, 0, 0.5, 1);
        this.rightView = new View(0, 0, width / 2, height).setViewport(0.5, 0, 0.5, 1);
        this.divider = new Graphics();
        this.divider.fillColor = Color.white;
        this.divider.drawRectangle(width / 2 - 1, 0, 2, height);
        this.leftPlayer = new Sprite(this.texture)
            .setAnchor(0.5)
            .setPosition(-160, 0)
            .setTint(new Color(120, 190, 255));
        this.rightPlayer = new Sprite(this.texture)
            .setAnchor(0.5)
            .setPosition(160, 0)
            .setTint(new Color(255, 180, 120));
        this.inputs.onActive(Keyboard.A, () => {
            this.move.a = 1;
        });
        this.inputs.onStop(Keyboard.A, () => {
            this.move.a = 0;
        });
        this.inputs.onActive(Keyboard.D, () => {
            this.move.d = 1;
        });
        this.inputs.onStop(Keyboard.D, () => {
            this.move.d = 0;
        });
        this.inputs.onActive(Keyboard.W, () => {
            this.move.w = 1;
        });
        this.inputs.onStop(Keyboard.W, () => {
            this.move.w = 0;
        });
        this.inputs.onActive(Keyboard.S, () => {
            this.move.s = 1;
        });
        this.inputs.onStop(Keyboard.S, () => {
            this.move.s = 0;
        });
        this.inputs.onActive(Keyboard.Left, () => {
            this.move.left = 1;
        });
        this.inputs.onStop(Keyboard.Left, () => {
            this.move.left = 0;
        });
        this.inputs.onActive(Keyboard.Right, () => {
            this.move.right = 1;
        });
        this.inputs.onStop(Keyboard.Right, () => {
            this.move.right = 0;
        });
        this.inputs.onActive(Keyboard.Up, () => {
            this.move.up = 1;
        });
        this.inputs.onStop(Keyboard.Up, () => {
            this.move.up = 0;
        });
        this.inputs.onActive(Keyboard.Down, () => {
            this.move.down = 1;
        });
        this.inputs.onStop(Keyboard.Down, () => {
            this.move.down = 0;
        });
    }
    update(delta) {
        const speed = 300 * delta.seconds;
        this.leftPlayer.move((this.move.d - this.move.a) * speed, (this.move.s - this.move.w) * speed);
        this.rightPlayer.move((this.move.right - this.move.left) * speed, (this.move.down - this.move.up) * speed);
        this.leftView.setCenter(this.leftPlayer.position.x, this.leftPlayer.position.y);
        this.rightView.setCenter(this.rightPlayer.position.x, this.rightPlayer.position.y);
    }
    draw(context) {
        context.clear(Color.black);
        context.render(this.leftPlayer, { view: this.leftView });
        context.render(this.rightPlayer, { view: this.leftView });
        context.render(this.leftPlayer, { view: this.rightView });
        context.render(this.rightPlayer, { view: this.rightView });
        context.render(this.divider, { view: context.screenView });
    }
}
app.start(new SplitScreenScene());
