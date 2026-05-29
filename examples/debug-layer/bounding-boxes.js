import { Application, Color, Scene, Sprite, Texture } from '@codexo/exojs';
import { DebugOverlay } from '@codexo/exojs/debug';

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

const debug = new DebugOverlay(app);
debug.layers.boundingBoxes.visible = true;

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { bunny: 'image/ship-a.png' });
        }
        init(loader) {
            this._sprites = [];
            for (let i = 0; i < 7; i++) {
                const sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setScale(0.8);
                sprite.setPosition(120 + i * 90, 300 + Math.sin(i) * 80);
                sprite._speed = 0.8 + i * 0.14;
                this._sprites.push(sprite);
            }
            this._time = 0;
        }
        update(delta) {
            this._time += delta.seconds;
            for (const sprite of this._sprites) {
                sprite.setRotation(this._time * 35 * sprite._speed);
                sprite.setPosition(sprite.position.x, 300 + Math.sin(this._time * sprite._speed) * 100);
            }
        }
        draw(context) {
            context.backend.clear();
            for (const sprite of this._sprites) context.render(sprite);
        }
    })()
);
