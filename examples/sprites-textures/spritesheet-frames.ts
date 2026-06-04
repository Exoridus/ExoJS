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

class SpritesheetFramesScene extends Scene {
    private _spritesheet!: Spritesheet;
    private _frameNames!: string[];
    private _frame = 0;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { characters: 'image/platformer-characters.png' });
        await loader.load(Json, { characters: 'json/platformer-characters.json' });
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;
        const texture = loader.get(Texture, 'characters');
        const data = loader.get(Json, 'characters') as import('@codexo/exojs').SpritesheetData;

        this._spritesheet = new Spritesheet(texture, data);
        this._frameNames = Array.from(this._spritesheet.frames.keys());

        for (const sprite of this._spritesheet.sprites.values()) {
            sprite.setAnchor(0.5);
            sprite.setPosition(width / 2, height / 2);
            sprite.setScale(2);
        }
    }

    override update(): void {
        this._frame = (this._frame + 1) % this._frameNames.length;
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._spritesheet.getFrameSprite(this._frameNames[this._frame]));
    }
}

app.start(new SpritesheetFramesScene());
