import { Application, Color, type RenderingContext, Scene, Sprite, type Time } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';



class SpriteBasicsScene extends Scene {
    private ship!: Sprite;
    // A single reusable tint colour whose alpha channel we animate each frame.
    private tint = new Color(120, 200, 255, 1);
    private elapsed = 0;
    private hud!: ReturnType<typeof mountControls>;

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        this.ship = new Sprite(this.loader.get('image/ship-a.png'));
        this.ship.setPosition((width / 2) | 0, (height / 2) | 0);
        this.ship.setAnchor(0.5);
        this.ship.setScale(3);
        this.ship.setTint(this.tint);

        this.hud = mountControls({
            title: 'Sprite Basics',
            hint: 'One Sprite, four transforms: position drifts, rotation spins, scale pulses, alpha fades.',
            status: 'alpha 1.00',
        });
    }

    override update(delta: Time): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        this.elapsed += delta.seconds;

        const { width, height } = app.canvas;

        // Position: a gentle figure-eight drift around the canvas centre.
        const driftX = Math.sin(this.elapsed * 0.8) * 90;
        const driftY = Math.sin(this.elapsed * 1.6) * 50;
        this.ship.setPosition(width / 2 + driftX, height / 2 + driftY);

        // Rotation: a steady spin (degrees per second).
        this.ship.rotate(delta.seconds * 90);

        // Scale: a slow breathing pulse between 2.4x and 3.6x.
        this.ship.setScale(3 + Math.sin(this.elapsed * 1.2) * 0.6);

        // Alpha: fade the tint's alpha channel between 0.2 and 1.0 and re-apply.
        const alpha = 0.6 + Math.sin(this.elapsed * 2) * 0.4;
        this.tint.a = alpha;
        this.ship.setTint(this.tint);

        this.hud.setStatus(`alpha ${alpha.toFixed(2)}`);
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.ship);
    }
}

const app = new Application({
    scenes: { SpriteBasicsScene },
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: new Color(18, 20, 28),
    loader: {
        basePath: 'assets/',
    },
});

app.start(SpriteBasicsScene);
