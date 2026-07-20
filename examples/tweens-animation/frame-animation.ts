import { AnimatedSprite, Application, Asset, Color, type RenderingContext, Scene, Spritesheet, type SpritesheetData, type Time } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';



const walkFps = 8;

class FrameAnimationScene extends Scene {
    private sprite!: AnimatedSprite;
    private frameCount = 0;
    private hud!: ReturnType<typeof mountControls>;

    override async init(): Promise<void> {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        const texture = this.loader.get('image/platformer-characters.png');
        const data = (await this.loader.load(Asset.kind('json', 'json/platformer-characters.json'))) as SpritesheetData;
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

    override update(delta: Time): void {
        this.sprite.update(delta);
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.sprite);
    }
}

const app = new Application({
    scenes: { FrameAnimationScene },
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

app.start(FrameAnimationScene);
