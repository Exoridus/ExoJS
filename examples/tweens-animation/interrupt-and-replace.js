// Auto-generated from interrupt-and-replace.ts — edit the .ts source, not this file.
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
class InterruptAndReplaceScene extends Scene {
    sprite;
    moveTween = null;
    async load(loader) {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }
    init(loader) {
        this.sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setPosition(400, 300);
        this.app.input.onPointerTap.add(pointer => {
            if (this.moveTween !== null) {
                this.moveTween.stop();
            }
            this.moveTween = this.app.tweens.create(this.sprite.position).to({ x: pointer.x, y: pointer.y }, 0.35).start();
        });
    }
    draw(context) {
        context.backend.clear();
        context.render(this.sprite);
    }
}
app.start(new InterruptAndReplaceScene());
