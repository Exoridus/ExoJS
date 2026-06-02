import { Application, Color, Keyboard, Scene, Sprite, Texture } from '@codexo/exojs';
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
debug.layers.performance.visible = true;

class MovingSprite extends Sprite {
    _vx = 0;
    _vy = 0;
}

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { bunny: 'image/ship-a.png' });
        }
        init(loader) {
            this._sprites = [];
            for (let i = 0; i < 1600; i++) {
                const sprite = new MovingSprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setScale(0.25);
                sprite.setPosition(Math.random() * 800, Math.random() * 600);
                sprite._vx = (Math.random() - 0.5) * 120;
                sprite._vy = (Math.random() - 0.5) * 120;
                this._sprites.push(sprite);
            }
            this.inputs.onTrigger(Keyboard.P, () => {
                debug.layers.performance.visible = !debug.layers.performance.visible;
            });
        }
        update(delta) {
            for (const sprite of this._sprites) {
                sprite.move(sprite._vx * delta.seconds, sprite._vy * delta.seconds);
                if (sprite.position.x < 0 || sprite.position.x > 800) sprite._vx *= -1;
                if (sprite.position.y < 0 || sprite.position.y > 600) sprite._vy *= -1;
            }
        }
        draw(context) {
            context.backend.clear();
            for (const sprite of this._sprites) context.render(sprite);
        }
    })()
);
