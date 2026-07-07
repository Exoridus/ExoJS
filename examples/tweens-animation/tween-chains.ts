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

class TweenChainsScene extends Scene {
    private sprite!: Sprite;

    override init(): void {
        const { width, height } = this.app.canvas;
        // A rectangle centred in the frame, spread across the wider 16:9 space.
        const left = width / 2 - width * 0.28;
        const right = width / 2 + width * 0.28;
        const top = height / 2 - height * 0.28;
        const bottom = height / 2 + height * 0.28;

        this.sprite = new Sprite(this.loader.get(Texture, 'image/ship-a.png')).setAnchor(0.5).setPosition(left, top);

        const a = this.app.tweens
            .create(this.sprite.position)
            .to({ x: right, y: top }, 0.6)
            .onComplete(() => {
                this.sprite.setRotation(90);
            });
        const b = this.app.tweens
            .create(this.sprite.position)
            .to({ x: right, y: bottom }, 0.6)
            .onComplete(() => {
                this.sprite.setRotation(180);
            });
        const c = this.app.tweens
            .create(this.sprite.position)
            .to({ x: left, y: bottom }, 0.6)
            .onComplete(() => {
                this.sprite.setRotation(270);
            });
        const d = this.app.tweens
            .create(this.sprite.position)
            .to({ x: left, y: top }, 0.6)
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
