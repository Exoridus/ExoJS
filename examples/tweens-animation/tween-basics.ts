import { Application, Color, Scene, Sprite, Text, Texture, Tween } from '@codexo/exojs';

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

class TweenBasicsScene extends Scene {
    private sprite!: Sprite;
    private text!: Text;
    private forward!: Tween;
    private backward!: Tween;

    override init(): void {
        const { width, height } = this.app.canvas;
        const left = width * 0.1;
        const right = width * 0.9;

        this.sprite = new Sprite(this.loader.get(Texture, 'image/ship-a.png')).setAnchor(0.5).setPosition(left, height / 2);
        this.text = new Text('Tween running', { fillColor: Color.white, fontSize: 18 });
        this.text.setPosition(20, 20);
        this.forward = this.app.tweens.create(this.sprite.position).to({ x: right }, 1.2);
        this.backward = this.app.tweens.create(this.sprite.position).to({ x: left }, 1.2);
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
