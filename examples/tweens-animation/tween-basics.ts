import { Application, Color, type RenderingContext, Scene, Sprite, Text, Tween } from '@codexo/exojs';



class TweenBasicsScene extends Scene {
    private sprite!: Sprite;
    private text!: Text;
    private forward!: Tween;
    private backward!: Tween;

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        const left = width * 0.1;
        const right = width * 0.9;

        this.sprite = new Sprite(this.loader.get('image/ship-a.png')).setAnchor(0.5).setPosition(left, height / 2);
        this.text = new Text('Tween running', { fillColor: Color.white, fontSize: 18 });
        this.text.setPosition(20, 20);
        this.forward = app.tweens.create(this.sprite.position).to({ x: right }, 1.2);
        this.backward = app.tweens.create(this.sprite.position).to({ x: left }, 1.2);
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

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.sprite);
        context.render(this.text);
    }
}

const app = new Application({
    scenes: { TweenBasicsScene },
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

app.start(TweenBasicsScene);
