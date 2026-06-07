// Auto-generated from tween-with-yoyo.ts — edit the .ts source, not this file.
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
class TweenWithYoyoScene extends Scene {
    sprite;
    async load(loader) {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }
    init(loader) {
        this.sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setPosition(400, 300);
        this.app.tweens.create(this.sprite.scale).to({ x: 1.5, y: 1.5 }, 0.8).yoyo(true).repeat(-1).start();
        this.app.tweens.create(this.sprite).to({ rotation: 20 }, 0.8).yoyo(true).repeat(-1).start();
    }
    draw(context) {
        context.backend.clear();
        context.render(this.sprite);
    }
}
app.start(new TweenWithYoyoScene());
