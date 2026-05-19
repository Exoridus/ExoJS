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

app.start(
    new (class extends Scene {
        init() {
            this._scene = new Graphics();
            this._a = new RenderTexture(800, 600);
            this._b = new RenderTexture(800, 600);
            this._c = new RenderTexture(800, 600);
            this._blur = new BlurFilter({ radius: 6, quality: 2 });
            this._color = new ColorFilter(new Color(140, 190, 255));
            this._final = new Sprite(this._c);
            this._time = 0;
        }
        update(delta) {
            this._time += delta.seconds;
        }
        _drawScene(backend) {
            this._scene.clear();
            this._scene.fillColor = new Color(80, 130, 255);
            this._scene.drawCircle(400 + Math.cos(this._time * 1.6) * 220, 300 + Math.sin(this._time * 1.8) * 160, 78);
            this._scene.fillColor = new Color(255, 170, 90);
            this._scene.drawCircle(400 + Math.cos(this._time * 1.2 + 1) * 210, 300 + Math.sin(this._time * 1.3 + 0.7) * 170, 54);
            this._scene.render(backend);
        }
        draw(backend) {
            backend.execute(
                new RenderTargetPass(
                    () => {
                        backend.clear();
                        this._drawScene(backend);
                    },
                    { target: this._a, view: this._a.view }
                )
            );
            this._blur.apply(backend, this._a, this._b);
            this._color.apply(backend, this._b, this._c);
            backend.clear();
            this._final.render(backend);
        }
    })()
);
