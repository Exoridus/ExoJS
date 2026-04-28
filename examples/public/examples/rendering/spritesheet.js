import { Application, Color, Scene, Spritesheet, Texture, Json } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

app.start(new Scene({

    async load(loader) {
        await loader.load(Texture, { explosion: 'image/explosion.png' });
        await loader.load(Json, { explosion: 'json/explosion.json' });
    },
    init(loader) {
        const { width, height } = this.app.canvas;
        const texture = loader.get(Texture, 'explosion');
        /** @type {import('@codexo/exojs').SpritesheetData} */
        const data = loader.get(Json, 'explosion');

        this._spritesheet = new Spritesheet(texture, data);
        this._sprite = this._spritesheet.getFrameSprite('explosion-0');
        this._frame = 0;
        this._frames = 64;

        for (const sprite of this._spritesheet.sprites.values()) {
            sprite.setAnchor(0.5);
            sprite.setPosition(width / 2, height / 2);
        }
    },

    update() {
        this._frame = (this._frame + 1) % this._frames;
        this._sprite = this._spritesheet.getFrameSprite(`explosion-${this._frame}`);
    },

    draw(backend) {
        backend.clear();
        this._sprite.render(backend);
    },
}));
