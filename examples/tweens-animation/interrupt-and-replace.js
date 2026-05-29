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

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { bunny: 'image/ship-a.png' });
        }
        init(loader) {
            this._sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setPosition(400, 300);
            this._moveTween = null;
            this.app.input.onPointerTap.add(pointer => {
                if (this._moveTween !== null) {
                    this._moveTween.stop();
                }
                this._moveTween = this.app.tweens.create(this._sprite.position).to({ x: pointer.x, y: pointer.y }, 0.35).start();
            });
        }
        draw(context) {
            context.backend.clear();
            context.render(this._sprite);
        }
    })()
);
