// Auto-generated from interrupt-and-replace.ts — edit the .ts source, not this file.
import { Application, Color, Scene, Sprite } from '@codexo/exojs';
class InterruptAndReplaceScene extends Scene {
    sprite;
    moveTween = null;
    init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        this.sprite = new Sprite(this.loader.get('image/ship-a.png')).setAnchor(0.5).setPosition(width / 2, height / 2);
        app.input.onPointerTap.add(pointer => {
            if (this.moveTween !== null) {
                this.moveTween.stop();
            }
            this.moveTween = app.tweens.create(this.sprite.position).to({ x: pointer.x, y: pointer.y }, 0.35).start();
        });
    }
    draw(context) {
        context.backend.clear();
        context.render(this.sprite);
    }
}
const app = new Application({
    scenes: { InterruptAndReplaceScene },
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
app.start(InterruptAndReplaceScene);
