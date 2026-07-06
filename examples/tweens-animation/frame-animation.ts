import { AnimatedSprite, Application, Color, Json, Scene, Spritesheet, Texture } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});

const walkFps = 8;

class FrameAnimationScene extends Scene {
    private sprite!: AnimatedSprite;
    private frameCount = 0;
    private hud!: ReturnType<typeof mountControls>;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { characters: 'image/platformer-characters.png' });
        await loader.load(Json, { characters: 'json/platformer-characters.json' });
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;
        const texture = loader.get(Texture, 'characters');
        const data = loader.get(Json, 'characters').value;
        const sheet = new Spritesheet(texture, data);

        const walkFrames = ['character_beige_walk_a', 'character_beige_walk_b'].map(name => sheet.getFrame(name));

        this.frameCount = walkFrames.length;
        this.sprite = new AnimatedSprite(texture, { walk: { frames: walkFrames, fps: walkFps } });
        this.sprite.setAnchor(0.5).setScale(3).setPosition(width / 2, height / 2);

        this.hud = mountControls({
            title: 'Frame Animation',
            controls: [{ keys: 'Auto', action: `looping walk cycle @ ${walkFps} fps` }],
            status: `Frame: 1/${this.frameCount}`,
            hint: 'AnimatedSprite steps through spritesheet frames on a timer; onFrame drives the live readout.',
        });

        // The onFrame signal fires on every frame advance with the 0-based index.
        this.sprite.onFrame.add((_clip, frame) => this.hud.setStatus(`Frame: ${frame + 1}/${this.frameCount}`));

        this.sprite.play('walk');
    }

    override update(delta): void {
        this.sprite.update(delta);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.sprite);
    }
}

app.start(new FrameAnimationScene());
