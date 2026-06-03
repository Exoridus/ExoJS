import { Application, Color, Graphics, Scene, Sprite, Texture, View } from '@codexo/exojs';

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

class PictureInPictureScene extends Scene {
    private _mainView!: View;
    private _pipView!: View;
    private _sprite!: Sprite;
    private _velocity = 220;
    private _frame!: Graphics;

    override async load(loader): Promise<void> {
        this._sprite = new Sprite(await loader.load(Texture, 'image/ship-a.png'));
    }

    override init(): void {
        const { width, height } = this.app.canvas;

        this._mainView = new View(0, 0, width, height);
        this._pipView = new View(0, 0, width * 0.3, height * 0.3);
        this._pipView.viewport.set(0.68, 0.04, 0.28, 0.28);
        this._pipView.setZoom(2.2);

        this._sprite.setAnchor(0.5).setPosition(-280, 0);

        this._frame = new Graphics();
        this._frame.lineWidth = 3;
        this._frame.lineColor = Color.white;
        this._frame.drawRectangle(width * 0.68, height * 0.04, width * 0.28, height * 0.28);
    }

    override update(delta): void {
        this._sprite.move(this._velocity * delta.seconds, 0);

        if (this._sprite.position.x > 320 || this._sprite.position.x < -320) {
            this._velocity *= -1;
        }

        this._pipView.follow(this._sprite, { lerp: 1 });
    }

    override draw(context): void {
        context.backend.clear();
        context.backend.setView(this._mainView);
        context.render(this._sprite);
        context.backend.setView(this._pipView);
        context.render(this._sprite);
        context.backend.setView(null);
        context.render(this._frame);
    }
}

app.start(new PictureInPictureScene());
