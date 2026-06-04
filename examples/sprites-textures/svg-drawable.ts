import { Application, Color, Scene, Sprite, SvgAsset, Texture } from '@codexo/exojs';

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

class SvgDrawableScene extends Scene {
    private _texture!: Texture;
    private _sprite!: Sprite;

    override async load(loader): Promise<void> {
        await loader.load(SvgAsset, { mark: 'svg/rune-mark.svg' });
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        this._texture = new Texture(loader.get(SvgAsset, 'mark'));

        this._sprite = new Sprite(this._texture);
        this._sprite.setAnchor(0.5);
        this._sprite.setPosition((width / 2) | 0, (height / 2) | 0);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._sprite);
    }
}

app.start(new SvgDrawableScene());
