import { Application, Color, Json, Scene, Spritesheet, type SpritesheetData, Texture } from '@codexo/exojs';

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
    private spritesheet!: Spritesheet;
    private frameNames!: string[];
    private frame = 0;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { characters: 'image/platformer-characters.png' });
        await loader.load(Json, { characters: 'json/platformer-characters.json' });
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;
        const texture = loader.get(Texture, 'characters');
        const data = loader.get(Json, 'characters') as SpritesheetData;

        this.spritesheet = new Spritesheet(texture, data);
        this.frameNames = Array.from(this.spritesheet.frames.keys());

        for (const sprite of this.spritesheet.sprites.values()) {
            sprite.setAnchor(0.5);
            sprite.setPosition(width / 2, height / 2);
            sprite.setScale(2);
        }
    }

    override update(): void {
        this.frame = (this.frame + 1) % this.frameNames.length;
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.spritesheet.getFrameSprite(this.frameNames[this.frame]));
    }
}

app.start(new SpritesheetFramesScene());
