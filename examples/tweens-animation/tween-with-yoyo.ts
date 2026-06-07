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
    private sprite!: Sprite;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        this.sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setPosition(400, 300);
        this.app.tweens.create(this.sprite.scale).to({ x: 1.5, y: 1.5 }, 0.8).yoyo(true).repeat(-1).start();
        this.app.tweens.create(this.sprite).to({ rotation: 20 }, 0.8).yoyo(true).repeat(-1).start();
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.sprite);
    }
}

app.start(new TweenWithYoyoScene());
