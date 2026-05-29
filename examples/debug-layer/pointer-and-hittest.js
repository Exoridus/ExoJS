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
debug.layers.hitTest.visible = true;
debug.layers.pointerStack.visible = true;

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { bunny: 'image/ship-a.png' });
        }
        init(loader) {
            this._sprites = [];
            for (let i = 0; i < 5; i++) {
                const sprite = new Sprite(loader.get(Texture, 'bunny'))
                    .setAnchor(0.5)
                    .setScale(1.2)
                    .setPosition(300 + i * 60, 300 + (i % 2) * 40);
                sprite.zIndex = i;
                sprite.interactive = true;
                sprite.draggable = true;
                sprite.setTint(
                    [new Color(255, 130, 130), new Color(130, 255, 170), new Color(140, 190, 255), new Color(255, 230, 130), new Color(220, 140, 255)][i]
                );
                this._sprites.push(sprite);
            }
        }
        draw(context) {
            context.backend.clear();
            for (const sprite of this._sprites) context.render(sprite);
        }
    })()
);
