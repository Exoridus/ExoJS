import { Application, Color, RenderTargetPass, RenderTexture, Scene, Sprite, Texture } from '@codexo/exojs';

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
        async load(loader) {
            await loader.load(Texture, { bunny: 'image/ship-a.png' });
        }
        init(loader) {
            this._rt = new RenderTexture(800, 600);
            this._decay = new Sprite(this._rt).setTint(new Color(255, 255, 255, 0.93));
            this._bunny = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5);
            this._final = new Sprite(this._rt);
            this._time = 0;
        }
        update(delta) {
            this._time += delta.seconds;
            this._bunny.setPosition(400 + Math.cos(this._time * 2.0) * 230, 300 + Math.sin(this._time * 2.7) * 170);
        }
        draw(context) {
            context.backend.execute(
                new RenderTargetPass(
                    () => {
                        context.render(this._decay);
                        context.render(this._bunny);
                    },
                    { target: this._rt, view: this._rt.view }
                )
            );
            context.backend.clear();
            context.render(this._final);
        }
    })()
);
