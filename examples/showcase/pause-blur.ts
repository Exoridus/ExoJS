import { Application, BlurFilter, Color, Keyboard, Scene, Sprite, Text, Texture } from '@codexo/exojs';
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

const PAUSE_BLUR_RADIUS = 6;
const PAUSE_FADE_SECONDS = 0.35;

class GameScene extends Scene {
    private sprite!: Sprite;
    private time = 0;
    private hud!: ReturnType<typeof mountControls>;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { ship: 'image/ship-a.png' });
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        this.sprite = new Sprite(loader.get(Texture, 'ship')).setAnchor(0.5).setScale(2).setPosition(width / 2, height / 2);
        this.addChild(this.sprite);

        this.hud = mountControls({
            title: 'Pause Blur',
            controls: [{ keys: 'Esc', action: 'pause / resume' }],
            hint: 'Press Esc to pause — the scene blurs up behind the menu.',
        });

        this.inputs.onTrigger(Keyboard.Escape, async () => {
            if (pauseScene.app !== null) return;
            await this.app.scene.pushScene(pauseScene, { mode: 'overlay' });
        });
    }

    override update(delta): void {
        this.time += delta.seconds;
        this.sprite.setRotation(this.time * 80);
    }

    override draw(context): void {
        context.backend.clear(new Color(20, 24, 34));
        context.render(this.root);
    }
}

class PauseScene extends Scene {
    private blur!: BlurFilter;
    private text!: Text;

    override init(): void {
        const { width, height } = this.app.canvas;

        // Start fully sharp and tween the radius up so the blur genuinely fades
        // in rather than snapping on. The global TweenManager keeps ticking while
        // this overlay scene is on the stack.
        this.blur = new BlurFilter({ radius: 0, quality: 2 });
        gameScene.root.filters = [this.blur];
        this.tweens.create(this.blur).to({ radius: PAUSE_BLUR_RADIUS }, PAUSE_FADE_SECONDS).start();

        this.text = new Text('PAUSED', { fillColor: Color.white, fontSize: 64, fontWeight: 'bold', align: 'center' });
        this.text.setAnchor(0.5, 0.5);
        this.text.setPosition(width / 2, height / 2);

        this.inputs.onTrigger(Keyboard.Escape, async () => {
            await this.app.scene.popScene();
        });
    }

    override draw(context): void {
        context.render(this.text);
    }

    override destroy(): void {
        gameScene.root.clearFilters();
        super.destroy();
    }
}

const gameScene = new GameScene();
const pauseScene = new PauseScene();

void app.start(gameScene);
