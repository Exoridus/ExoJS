import { Application, Asset, Color, type RenderingContext, Scene, Spritesheet, type SpritesheetData, type Time } from '@codexo/exojs';
import { mountControlPanel, mountControls } from '@examples/runtime';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: new Color(24, 28, 38),
    loader: {
        basePath: 'assets/',
    },
});

const CHARACTERS = ['beige', 'green', 'pink', 'purple', 'yellow'];

class SpritesheetFramesScene extends Scene {
    private spritesheet!: Spritesheet;
    private character = CHARACTERS[0];
    private frameIndex = 0;
    private fps = 8;
    private elapsed = 0;
    private playing = true;
    private hud!: ReturnType<typeof mountControls>;

    override async init(): Promise<void> {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        const texture = this.loader.get('image/platformer-characters.png');
        const data = (await this.loader.load(Asset.kind('json', 'json/platformer-characters.json'))) as SpritesheetData;

        this.spritesheet = new Spritesheet(texture, data);

        // The spritesheet caches one Sprite per named frame; configure them all
        // once so any frame we draw is centred and scaled up for visibility.
        for (const sprite of this.spritesheet.sprites.values()) {
            sprite.setAnchor(0.5);
            sprite.setPosition(width / 2, height / 2);
            sprite.setScale(3);
        }

        this.hud = mountControls({
            title: 'Spritesheet Frames',
            hint: 'A two-frame walk cycle stepped on a timer from named spritesheet frames.',
        });

        const panel = mountControlPanel({ title: 'Animation' });
        panel.addSlider({ label: 'Speed (fps)', min: 1, max: 16, step: 1, value: this.fps, onChange: value => (this.fps = value) });
        panel.addCycle({
            label: 'Character',
            options: CHARACTERS,
            index: 0,
            onChange: (_, name) => {
                this.character = name;
                this.frameIndex = 0;
                this.updateHud();
            },
        });
        panel.addToggle({ label: 'Playing', value: true, onChange: on => (this.playing = on) });

        this.updateHud();
    }

    private walkFrames(): Array<string> {
        return [`character_${this.character}_walk_a`, `character_${this.character}_walk_b`];
    }

    private updateHud(): void {
        const frames = this.walkFrames();

        this.hud.setStatus(`Frame: ${frames[this.frameIndex]}  (${this.frameIndex + 1}/${frames.length})`);
    }

    override update(delta: Time): void {
        if (!this.playing) {
            return;
        }

        this.elapsed += delta.seconds;

        const frameDuration = 1 / this.fps;

        while (this.elapsed >= frameDuration) {
            this.elapsed -= frameDuration;
            this.frameIndex = (this.frameIndex + 1) % this.walkFrames().length;
            this.updateHud();
        }
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.spritesheet.getFrameSprite(this.walkFrames()[this.frameIndex]));
    }
}

app.start(new SpritesheetFramesScene());
