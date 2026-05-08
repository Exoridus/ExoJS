import { AnimatedSprite, Application, Color, Json, Scene, Spritesheet, Texture } from '@codexo/exojs';

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
        draw(backend) {
            backend.clear();
            this._sprite.render(backend);
        }
    })()
);
