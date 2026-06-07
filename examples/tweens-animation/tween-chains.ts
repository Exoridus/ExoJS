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

class TweenChainsScene extends Scene {
    private sprite!: Sprite;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        this.sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setPosition(240, 140);

        const a = this.app.tweens
            .create(this.sprite.position)
            .to({ x: 560, y: 140 }, 0.6)
            .onComplete(() => {
                this.sprite.setRotation(90);
            });
        const b = this.app.tweens
            .create(this.sprite.position)
            .to({ x: 560, y: 460 }, 0.6)
            .onComplete(() => {
                this.sprite.setRotation(180);
            });
        const c = this.app.tweens
            .create(this.sprite.position)
            .to({ x: 240, y: 460 }, 0.6)
            .onComplete(() => {
                this.sprite.setRotation(270);
            });
        const d = this.app.tweens
            .create(this.sprite.position)
            .to({ x: 240, y: 140 }, 0.6)
            .onComplete(() => {
                this.sprite.setRotation(0);
            });

        a.chain(b);
        b.chain(c);
        c.chain(d);
        d.onComplete(() => a.start());
        a.start();
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.sprite);
    }
}

app.start(new TweenChainsScene());
