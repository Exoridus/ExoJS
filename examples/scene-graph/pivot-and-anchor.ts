import { Application, Color, Graphics, type RenderingContext, Scene, Sprite, Text, type Time } from '@codexo/exojs';



const modes = [
    { name: 'corner', anchor: [0, 0] as [number, number], origin: [0, 0] as [number, number] | null },
    { name: 'center', anchor: [0.5, 0.5] as [number, number], origin: null },
    { name: 'off-canvas', anchor: [0.5, 0.5] as [number, number], origin: [180, -80] as [number, number] | null },
];

class PivotAndAnchorScene extends Scene {
    private sprite!: Sprite;
    private pivotMarker!: Graphics;
    private label!: Text;
    private mode = 0;
    private timer = 0;

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        this.sprite = new Sprite(this.loader.get('image/ship-a.png')).setPosition(width / 2, height / 2);
        this.pivotMarker = new Graphics();
        this.label = new Text('', { fillColor: Color.white, fontSize: 18 });
        this.label.setPosition(20, 20);
        this.applyMode();
    }

    private applyMode(): void {
        const mode = modes[this.mode];
        this.sprite.setAnchor(mode.anchor[0], mode.anchor[1]);
        if (mode.origin) this.sprite.setOrigin(mode.origin[0], mode.origin[1]);
        this.label.text = `mode: ${mode.name}`;
    }

    override update(delta: Time): void {
        this.timer += delta.seconds;
        this.sprite.rotate(delta.seconds * 90);
        if (this.timer > 1.8) {
            this.timer = 0;
            this.mode = (this.mode + 1) % modes.length;
            this.applyMode();
        }
    }

    override draw(context: RenderingContext): void {
        const m = this.sprite.getGlobalTransform();
        context.backend.clear();
        context.render(this.sprite);
        this.pivotMarker.clear();
        this.pivotMarker.fillColor = new Color(255, 80, 80);
        this.pivotMarker.drawCircle(m.x, m.y, 5);
        context.render(this.pivotMarker);
        context.render(this.label);
    }
}

const app = new Application({
    scenes: { PivotAndAnchorScene },
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

app.start(PivotAndAnchorScene);
