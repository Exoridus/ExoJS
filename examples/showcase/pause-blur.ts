import { Application, BlurFilter, Color, Keyboard, Label, Panel, Scene, Sprite, Texture } from '@codexo/exojs';
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

/**
 * Pause without a scene stack: a pause overlay lives on `scene.ui` (always
 * above the world) and is toggled together with `scene.paused`, which skips the
 * scene's `update` + systems while it keeps drawing. The blur tween runs on the
 * app-level TweenManager, so it still animates while the scene is frozen.
 */
class GameScene extends Scene {
    private sprite!: Sprite;
    private time = 0;
    private readonly blur = new BlurFilter({ radius: 0, quality: 2 });
    private pausePanel!: Panel;
    private pauseLabel!: Label;
    private hud!: ReturnType<typeof mountControls>;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { ship: 'image/ship-a.png' });
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        this.sprite = new Sprite(loader.get(Texture, 'ship')).setAnchor(0.5).setScale(2).setPosition(width / 2, height / 2);
        this.addChild(this.sprite);

        // Pause overlay on the UI layer, hidden until paused.
        this.pausePanel = new Panel({ width: 420, height: 140, cornerRadius: 18, color: new Color(0, 0, 0, 0.6) });
        this.pausePanel.anchorIn(this.ui, 'center');
        this.pausePanel.visible = false;
        this.ui.addChild(this.pausePanel);

        this.pauseLabel = new Label('PAUSED', { fontSize: 56, fontWeight: 'bold' });
        this.pauseLabel.anchorIn(this.ui, 'center');
        this.pauseLabel.visible = false;
        this.ui.addChild(this.pauseLabel);

        this.hud = mountControls({
            title: 'Pause Blur',
            controls: [{ keys: 'Esc', action: 'pause / resume' }],
            hint: 'Press Esc to pause — the scene blurs up behind the menu.',
        });

        this.inputs.onTrigger(Keyboard.Escape, () => this.togglePause());
    }

    override update(delta): void {
        // Not called while paused — the SceneManager skips update() + systems.
        this.time += delta.seconds;
        this.sprite.setRotation(this.time * 80);
    }

    override draw(context): void {
        context.backend.clear(new Color(20, 24, 34));
        context.render(this.root);
    }

    override destroy(): void {
        this.root.clearFilters();
        super.destroy();
    }

    private togglePause(): void {
        this.paused = !this.paused;
        this.pausePanel.visible = this.paused;
        this.pauseLabel.visible = this.paused;

        if (this.paused) {
            this.blur.radius = 0;
            this.root.filters = [this.blur];
            this.tweens.create(this.blur).to({ radius: PAUSE_BLUR_RADIUS }, PAUSE_FADE_SECONDS).start();
        } else {
            this.root.clearFilters();
        }
    }
}

void app.start(new GameScene());
