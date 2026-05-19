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

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { bunny: 'image/bunny.png' });
        }
        init(loader) {
            const { width, height } = this.app.canvas;

            this._mainView = new View(0, 0, width, height);
            this._pipView = new View(0, 0, width * 0.3, height * 0.3);
            this._pipView.viewport.set(0.68, 0.04, 0.28, 0.28);
            this._pipView.setZoom(2.2);

            this._sprite = new Sprite(loader.get(Texture, 'bunny'));
            this._sprite.setAnchor(0.5).setPosition(-280, 0);
            this._velocity = 220;

            this._frame = new Graphics();
            this._frame.lineWidth = 3;
            this._frame.lineColor = Color.white;
            this._frame.drawRectangle(width * 0.68, height * 0.04, width * 0.28, height * 0.28);
        }
        update(delta) {
            this._sprite.move(this._velocity * delta.seconds, 0);
            if (this._sprite.position.x > 320 || this._sprite.position.x < -320) {
                this._velocity *= -1;
            }
            this._pipView.follow(this._sprite, { lerp: 1 });
        }
        draw(backend) {
            backend.clear();
            backend.setView(this._mainView);
            this._sprite.render(backend);
            backend.setView(this._pipView);
            this._sprite.render(backend);
            backend.setView(null);
            this._frame.render(backend);
        }
    })()
);
