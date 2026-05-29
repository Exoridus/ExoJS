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
            await loader.load(Texture, { characters: 'image/platformer-characters.png' });
            await loader.load(Json, { characters: 'json/platformer-characters.json' });
        }
        init(loader) {
            const texture = loader.get(Texture, 'characters');
            const data = loader.get(Json, 'characters');
            const sheet = new Spritesheet(texture, data);

            const walkFrames = ['character_beige_walk_a', 'character_beige_walk_b'].map(name => sheet.getFrame(name));

            this._sprite = new AnimatedSprite(texture, { walk: { frames: walkFrames, fps: 8, loop: true } });
            this._sprite.setAnchor(0.5).setScale(3).setPosition(400, 300);
            this._sprite.play('walk');
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
