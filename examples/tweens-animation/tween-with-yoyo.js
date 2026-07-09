// Auto-generated from tween-with-yoyo.ts — edit the .ts source, not this file.
import { Application, Color, Scene, Sprite } from '@codexo/exojs';
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
class TweenWithYoyoScene extends Scene {
    sprite;
    async load(loader) {
        await loader.load('image/ship-a.png');
    }
    init(loader) {
        const { width, height } = this.app.canvas;
        this.sprite = new Sprite(loader.get('image/ship-a.png')).setAnchor(0.5).setPosition(width / 2, height / 2);
        this.app.tweens.create(this.sprite.scale).to({ x: 1.5, y: 1.5 }, 0.8).yoyo(true).repeat(-1).start();
        this.app.tweens.create(this.sprite).to({ rotation: 20 }, 0.8).yoyo(true).repeat(-1).start();
    }
    draw(context) {
        context.backend.clear();
        context.render(this.sprite);
    }
}
app.start(new TweenWithYoyoScene());
