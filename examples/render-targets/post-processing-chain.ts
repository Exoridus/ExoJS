import { Application, BlurFilter, Color, ColorFilter, Graphics, RenderTargetPass, RenderTexture, Scene, Sprite } from '@codexo/exojs';

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

class PostProcessingChainScene extends Scene {
    private _scene!: Graphics;
    private _a!: RenderTexture;
    private _b!: RenderTexture;
    private _c!: RenderTexture;
    private _blur!: BlurFilter;
    private _color!: ColorFilter;
    private _final!: Sprite;
    private _time = 0;

    override init(): void {
        this._scene = new Graphics();
        this._a = new RenderTexture(800, 600);
        this._b = new RenderTexture(800, 600);
        this._c = new RenderTexture(800, 600);
        this._blur = new BlurFilter({ radius: 6, quality: 2 });
        this._color = new ColorFilter(new Color(140, 190, 255));
        this._final = new Sprite(this._c);
    }

    override update(delta): void {
        this._time += delta.seconds;
    }

    private _drawScene(backend): void {
        this._scene.clear();
        this._scene.fillColor = new Color(80, 130, 255);
        this._scene.drawCircle(400 + Math.cos(this._time * 1.6) * 220, 300 + Math.sin(this._time * 1.8) * 160, 78);
        this._scene.fillColor = new Color(255, 170, 90);
        this._scene.drawCircle(400 + Math.cos(this._time * 1.2 + 1) * 210, 300 + Math.sin(this._time * 1.3 + 0.7) * 170, 54);
        this._scene.render(backend);
    }

    override draw(context): void {
        context.backend.execute(
            new RenderTargetPass(
                () => {
                    context.backend.clear();
                    this._drawScene(context.backend);
                },
                { target: this._a, view: this._a.view },
            ),
        );
        this._blur.apply(context.backend, this._a, this._b);
        this._color.apply(context.backend, this._b, this._c);
        context.backend.clear();
        context.render(this._final);
    }
}

app.start(new PostProcessingChainScene());
