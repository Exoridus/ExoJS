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
    private _sprite!: Sprite;
    private _text!: Text;
    private _forward!: Tween;
    private _backward!: Tween;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        this._sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setPosition(120, 300);
        this._text = new Text('Tween running', { fillColor: Color.white, fontSize: 18 });
        this._text.setPosition(20, 20);
        this._forward = this.app.tweens.create(this._sprite.position).to({ x: 680 }, 1.2);
        this._backward = this.app.tweens.create(this._sprite.position).to({ x: 120 }, 1.2);
        this._forward
            .onComplete(() => {
                this._text.text = 'Completed -> reverse';
                this._backward.start();
            })
            .start();
        this._backward.onComplete(() => {
            this._text.text = 'Completed -> forward';
            this._forward.start();
        });
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._sprite);
        context.render(this._text);
    }
}

app.start(new TweenBasicsScene());
