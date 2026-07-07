import { Application, Color, Scene, Sprite, Texture } from '@codexo/exojs';

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
    private sprite!: Sprite;

    override init(): void {
        const { width, height } = this.app.canvas;

        this.sprite = new Sprite(this.loader.get(Texture, 'image/ship-a.png')).setAnchor(0.5).setPosition(width / 2, height / 2);
        this.app.tweens.create(this.sprite.scale).to({ x: 1.5, y: 1.5 }, 0.8).yoyo(true).repeat(-1).start();
        this.app.tweens.create(this.sprite).to({ rotation: 20 }, 0.8).yoyo(true).repeat(-1).start();
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.sprite);
    }
}

app.start(new TweenWithYoyoScene());
