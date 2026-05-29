import { Application, Color, Json, Scene, Spritesheet, Texture } from '@codexo/exojs';

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
            const { width, height } = this.app.canvas;
            const texture = loader.get(Texture, 'characters');
            /** @type {import('@codexo/exojs').SpritesheetData} */
            const data = loader.get(Json, 'characters');

            this._spritesheet = new Spritesheet(texture, data);
            this._frameNames = Array.from(this._spritesheet.frames.keys());
            this._frame = 0;

            for (const sprite of this._spritesheet.sprites.values()) {
                sprite.setAnchor(0.5);
                sprite.setPosition(width / 2, height / 2);
                sprite.setScale(2);
            }
        }
        update() {
            this._frame = (this._frame + 1) % this._frameNames.length;
        }
        draw(context) {
            context.backend.clear();
            context.render(this._spritesheet.getFrameSprite(this._frameNames[this._frame]));
        }
    })()
);
