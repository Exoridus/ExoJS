import { Application, Color, ColorFilter, Scene, Signal, Sprite, Texture } from '@codexo/exojs';

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

class DamageFlashScene extends Scene {
    private _hit!: Signal;
    private _sprite!: Sprite;
    private _filterColor!: Color;
    private _filter!: ColorFilter;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        this._hit = new Signal();
        this._sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setScale(2.2).setPosition(400, 300);
        this._filterColor = new Color(255, 255, 255, 1);
        this._filter = new ColorFilter(this._filterColor);
        this._sprite.filters = [this._filter];
        this._hit.add(() => {
            this._filterColor.set(255, 120, 120, 1);
            this.app.tweens.create(this._filterColor).to({ r: 255, g: 255, b: 255 }, 0.2).start();
        });
        this.app.input.onPointerTap.add(() => {
            this._hit.dispatch();
        });
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._sprite);
    }
}

app.start(new DamageFlashScene());
