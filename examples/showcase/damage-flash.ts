import { Application, Color, ColorFilter, type RenderingContext, Scene, Signal, Sprite } from '@codexo/exojs';
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

class DamageFlashScene extends Scene {
    private hit!: Signal;
    private ship!: Sprite;
    private filterColor!: Color;
    private filter!: ColorFilter;
    private hud!: ReturnType<typeof mountControls>;
    private hits = 0;

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        this.hit = new Signal();
        this.ship = new Sprite(this.loader.get('image/ship-a.png')).setAnchor(0.5).setScale(2.2).setPosition(width / 2, height / 2);
        this.filterColor = new Color(255, 255, 255, 1);
        this.filter = new ColorFilter(this.filterColor);
        this.ship.filters = [this.filter];

        this.hud = mountControls({
            title: 'Damage Flash',
            controls: [{ keys: 'Click', action: 'flash the ship' }],
            status: 'Hits: 0',
        });

        this.hit.add(() => {
            this.hits++;
            this.hud.setStatus(`Hits: ${this.hits}`);
            this.filterColor.set(255, 120, 120, 1);
            app.tweens.create(this.filterColor).to({ r: 255, g: 255, b: 255 }, 0.2).start();
        });
        app.input.onPointerTap.add(() => {
            this.hit.dispatch();
        });
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.ship);
    }
}

app.start(new DamageFlashScene());
