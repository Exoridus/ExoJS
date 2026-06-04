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

// #region guide:first-scene
class HelloWorldScene extends Scene {
    private _sprite!: Sprite;

    override async load(loader): Promise<void> {
        this._sprite = new Sprite(await loader.load(Texture, 'image/ship-a.png'));
    }

    override init(): void {
        const { width, height } = this.app.canvas;

        this._sprite.setAnchor(0.5);
        this._sprite.setPosition(width / 2, height / 2);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._sprite);
    }
}
// #endregion guide:first-scene

app.start(new HelloWorldScene());
