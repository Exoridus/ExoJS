import { Application, BlurFilter, Color, Keyboard, Label, Panel, type RenderingContext, Scene, Sprite, type Time } from '@codexo/exojs';
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
 * above the world) and is toggled together with a scene-local `frozen` flag,
 * which the scene's own `update()` checks to skip gameplay while it keeps
 * drawing. The blur tween runs on the app-level TweenManager, so it still
 * animates while the scene is frozen.
 */
class GameScene extends Scene {
    private sprite!: Sprite;
    private time = 0;
    private frozen = false;
    private readonly blur = new BlurFilter({ radius: 0, quality: 2 });
    private pausePanel!: Panel;
    private pauseLabel!: Label;
    private hud!: ReturnType<typeof mountControls>;

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        this.sprite = new Sprite(this.loader.get('image/ship-a.png')).setAnchor(0.5).setScale(2).setPosition(width / 2, height / 2);
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
            controls: [{ keys: 'Esc / Click', action: 'pause / resume' }],
            hint: 'Press Esc or click to pause — the scene blurs up behind the menu.',
        });

        this.inputs.onTrigger(Keyboard.Escape, () => this.togglePause());
        // Same toggle on click/tap so the pause works without a keyboard.
        app.input.onPointerTap.add(() => this.togglePause());
    }

    override update(delta: Time): void {
        if (this.frozen) return;

        this.time += delta.seconds;
        this.sprite.setRotation(this.time * 80);
    }

    override draw(context: RenderingContext): void {
        context.backend.clear(new Color(20, 24, 34));
        context.render(this.root);
    }

    override destroy(): void {
        this.root.clearFilters();
        super.destroy();
    }

    private togglePause(): void {
        this.frozen = !this.frozen;
        this.pausePanel.visible = this.frozen;
        this.pauseLabel.visible = this.frozen;

        if (this.frozen) {
            this.blur.radius = 0;
            this.root.filters = [this.blur];
            this.tweens.create(this.blur).to({ radius: PAUSE_BLUR_RADIUS }, PAUSE_FADE_SECONDS).start();
        } else {
            this.root.clearFilters();
        }
    }
}

void app.start(new GameScene());
