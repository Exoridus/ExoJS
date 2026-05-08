import { Application, BlendModes, BlurFilter, Color, RenderTargetPass, RenderTexture, Scene, Sprite, Texture } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { bunny: 'image/bunny.png' });
        }
        init(loader) {
            this._baseRt = new RenderTexture(800, 600);
            this._glowRt = new RenderTexture(800, 600);
            this._blurredRt = new RenderTexture(800, 600);
            this._bunny = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setScale(1.9);
            this._baseSprite = new Sprite(this._baseRt);
            this._glowSprite = new Sprite(this._blurredRt).setTint(new Color(255, 255, 255, 0.8)).setBlendMode(BlendModes.Additive);
            this._blur = new BlurFilter({ radius: 10, quality: 2 });
            this._time = 0;
        }
        update(delta) {
            this._time += delta.seconds;
            this._bunny.setPosition(400 + Math.cos(this._time * 1.7) * 190, 300 + Math.sin(this._time * 1.2) * 160);
        }
        draw(backend) {
            backend.execute(
                new RenderTargetPass(
                    () => {
                        backend.clear();
                        this._bunny.setTint(Color.white);
                        this._bunny.render(backend);
                    },
                    { target: this._baseRt, view: this._baseRt.view }
                )
            );
            backend.execute(
                new RenderTargetPass(
                    () => {
                        backend.clear();
                        this._bunny.setTint(new Color(255, 230, 190));
                        this._bunny.render(backend);
                    },
                    { target: this._glowRt, view: this._glowRt.view }
                )
            );
            this._blur.apply(backend, this._glowRt, this._blurredRt);
            backend.clear();
            this._baseSprite.render(backend);
            this._glowSprite.render(backend);
        }
    })()
);
