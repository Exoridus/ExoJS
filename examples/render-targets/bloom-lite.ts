import { Application, BlendModes, BlurFilter, Color, RenderTargetPass, RenderTexture, Scene, Sprite, Texture } from '@codexo/exojs';

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

class BloomLiteScene extends Scene {
    private _baseRt!: RenderTexture;
    private _glowRt!: RenderTexture;
    private _blurredRt!: RenderTexture;
    private _bunny!: Sprite;
    private _baseSprite!: Sprite;
    private _glowSprite!: Sprite;
    private _blur!: BlurFilter;
    private _time = 0;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        this._baseRt = new RenderTexture(800, 600);
        this._glowRt = new RenderTexture(800, 600);
        this._blurredRt = new RenderTexture(800, 600);
        this._bunny = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setScale(1.9);
        this._baseSprite = new Sprite(this._baseRt);
        this._glowSprite = new Sprite(this._blurredRt).setTint(new Color(255, 255, 255, 0.8)).setBlendMode(BlendModes.Additive);
        this._blur = new BlurFilter({ radius: 10, quality: 2 });
    }

    override update(delta): void {
        this._time += delta.seconds;
        this._bunny.setPosition(400 + Math.cos(this._time * 1.7) * 190, 300 + Math.sin(this._time * 1.2) * 160);
    }

    override draw(context): void {
        context.backend.execute(
            new RenderTargetPass(
                () => {
                    context.backend.clear();
                    this._bunny.setTint(Color.white);
                    context.render(this._bunny);
                },
                { target: this._baseRt, view: this._baseRt.view },
            ),
        );
        context.backend.execute(
            new RenderTargetPass(
                () => {
                    context.backend.clear();
                    this._bunny.setTint(new Color(255, 230, 190));
                    context.render(this._bunny);
                },
                { target: this._glowRt, view: this._glowRt.view },
            ),
        );
        this._blur.apply(context.backend, this._glowRt, this._blurredRt);
        context.backend.clear();
        context.render(this._baseSprite);
        context.render(this._glowSprite);
    }
}

app.start(new BloomLiteScene());
