import { Application, Color, Scene, Sprite, Texture, Tween } from '@codexo/exojs';

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

class InterruptAndReplaceScene extends Scene {
    private _sprite!: Sprite;
    private _moveTween: Tween | null = null;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        this._sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setPosition(400, 300);
        this.app.input.onPointerTap.add(pointer => {
            if (this._moveTween !== null) {
                this._moveTween.stop();
            }
            this._moveTween = this.app.tweens.create(this._sprite.position).to({ x: pointer.x, y: pointer.y }, 0.35).start();
        });
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._sprite);
    }
}

app.start(new InterruptAndReplaceScene());
