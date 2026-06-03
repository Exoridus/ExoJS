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

class FrameAnimationScene extends Scene {
    private _sprite!: AnimatedSprite;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { characters: 'image/platformer-characters.png' });
        await loader.load(Json, { characters: 'json/platformer-characters.json' });
    }

    override init(loader): void {
        const texture = loader.get(Texture, 'characters');
        const data = loader.get(Json, 'characters');
        const sheet = new Spritesheet(texture, data);

        const walkFrames = ['character_beige_walk_a', 'character_beige_walk_b'].map(name => sheet.getFrame(name));

        this._sprite = new AnimatedSprite(texture, { walk: { frames: walkFrames, fps: 8, loop: true } });
        this._sprite.setAnchor(0.5).setScale(3).setPosition(400, 300);
        this._sprite.play('walk');
    }

    override update(delta): void {
        this._sprite.update(delta);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._sprite);
    }
}

app.start(new FrameAnimationScene());
