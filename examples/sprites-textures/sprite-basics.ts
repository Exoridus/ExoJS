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

class SpriteBasicsScene extends Scene {
    private _bunny!: Sprite;
    private _tints!: Color[];
    private _tintIndex = 0;
    private _tintTime = 0;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        this._bunny = new Sprite(loader.get(Texture, 'bunny'));
        this._bunny.setPosition((width / 2) | 0, (height / 2) | 0);
        this._bunny.setAnchor(0.5);
        this._tints = [new Color(255, 120, 120), new Color(120, 255, 160), new Color(120, 180, 255)];
        this._bunny.setTint(this._tints[this._tintIndex]);
    }

    override update(delta): void {
        this._bunny.rotate(delta.seconds * 360);
        this._tintTime += delta.seconds;

        if (this._tintTime >= 0.5) {
            this._tintTime = 0;
            this._tintIndex = (this._tintIndex + 1) % this._tints.length;
            this._bunny.setTint(this._tints[this._tintIndex]);
        }
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._bunny);
    }
}

app.start(new SpriteBasicsScene());
