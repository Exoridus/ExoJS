import { Application, Color, Scene, Sprite, Text, Texture, Tween } from '@codexo/exojs';

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

class TweenBasicsScene extends Scene {
    private sprite!: Sprite;
    private text!: Text;
    private forward!: Tween;
    private backward!: Tween;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        this.sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setPosition(120, 300);
        this.text = new Text('Tween running', { fillColor: Color.white, fontSize: 18 });
        this.text.setPosition(20, 20);
        this.forward = this.app.tweens.create(this.sprite.position).to({ x: 680 }, 1.2);
        this.backward = this.app.tweens.create(this.sprite.position).to({ x: 120 }, 1.2);
        this.forward
            .onComplete(() => {
                this.text.text = 'Completed -> reverse';
                this.backward.start();
            })
            .start();
        this.backward.onComplete(() => {
            this.text.text = 'Completed -> forward';
            this.forward.start();
        });
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.sprite);
        context.render(this.text);
    }
}

app.start(new TweenBasicsScene());
