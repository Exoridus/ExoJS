import { Application, Color, Graphics, Label, ProgressBar, type RenderingContext, Scene, type Time } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
});

/**
 * A screen-fixed HUD on `scene.ui` sits above the world automatically — no
 * separate overlay scene or stack. The world (a spinning arc) is drawn from
 * `scene.root`; the HUD (a label + a live health bar) lives on `scene.ui` and
 * is auto-rendered on top.
 */
class GameScene extends Scene {
    private angle = 0;
    private time = 0;
    private ring!: Graphics;
    private health!: ProgressBar;

    override init(): void {
        this.ring = new Graphics();

        const title = new Label('HUD Overlay', { fontSize: 22 });
        title.anchorIn(this.ui, 'top-left', 18, 14);
        this.ui.addChild(title);

        this.health = new ProgressBar({ width: 240, height: 12, value: 1 });
        this.health.anchorIn(this.ui, 'top-left', 18, 48);
        this.ui.addChild(this.health);
    }

    override update(delta: Time): void {
        this.angle += delta.seconds * 90;
        this.time += delta.seconds;
        this.health.value = (Math.sin(this.time) + 1) / 2;
    }

    override draw(context: RenderingContext): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        context.backend.clear(new Color(20, 32, 58));
        this.ring.clear();
        this.ring.lineWidth = 20;
        this.ring.lineColor = new Color(90, 180, 255);
        this.ring.drawArc(width / 2, height / 2, 160, 0, (this.angle * Math.PI) / 180);
        context.render(this.ring);
    }
}

void app.start(new GameScene());
