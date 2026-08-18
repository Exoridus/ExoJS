import { Application, Color, type RenderingContext, Scene, Signal, Sprite } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';



class DamageFlashScene extends Scene {
    private hit!: Signal;
    private ship!: Sprite;
    private flashColor!: Color;
    private hud!: ReturnType<typeof mountControls>;
    private hits = 0;

    override init(): void {
        const app = this.app;
        const { width, height } = app;

        this.hit = new Signal();
        this.ship = new Sprite(this.loader.get('image/ship-a.png')).setAnchor(0.5).setScale(2.2).setPosition(width / 2, height / 2);
        // A single drawable's flash is a tint, not a filter: it multiplies in
        // the sprite shader and costs no render target.
        this.flashColor = new Color(255, 255, 255, 1);

        this.hud = mountControls({
            title: 'Damage Flash',
            controls: [{ keys: 'Click', action: 'flash the ship' }],
            status: 'Hits: 0',
        });

        this.hit.add(() => {
            this.hits++;
            this.hud.setStatus(`Hits: ${this.hits}`);
            this.flashColor.set(255, 120, 120, 1);
            app.tweens.create(this.flashColor).to({ r: 255, g: 255, b: 255 }, 0.2).start();
        });
        app.input.onPointerTap.add(() => {
            this.hit.dispatch();
        });
    }

    override update(): void {
        // The tween moves the Color; handing it to setTint is what tells the
        // renderer about it.
        this.ship.setTint(this.flashColor);
    }

    override draw(context: RenderingContext): void {
        context.render(this.ship);
    }
}

const app = new Application({
    scenes: { DamageFlashScene },
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

app.start(DamageFlashScene);
