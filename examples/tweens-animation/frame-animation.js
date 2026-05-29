import { AnimatedSprite, Application, Color, Json, Scene, Spritesheet, Texture } from '@codexo/exojs';

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
            await loader.load(Texture, { explosion: 'image/explosion.png' });
            await loader.load(Json, { explosion: 'json/explosion.json' });
        }
        init(loader) {
            const texture = loader.get(Texture, 'explosion');
            const data = loader.get(Json, 'explosion');
            const sheet = new Spritesheet(texture, data);
            const frames = Array.from(sheet.frames.values());

            this._sprite = new AnimatedSprite(texture, { burst: { frames, fps: 22, loop: true } });
            this._sprite.setAnchor(0.5).setScale(2).setPosition(400, 300);
            this._sprite.play('burst');
        }
        update(delta) {
            this._sprite.update(delta);
        }
        draw(context) {
            context.backend.clear();
            context.render(this._sprite);
        }
    })()
);
