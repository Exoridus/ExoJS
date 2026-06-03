import { Application, Color, Graphics, Scene, Sprite, Text, Texture } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});

document.body.append(app.canvas);

const modes = [
    { name: 'corner', anchor: [0, 0] as [number, number], origin: [0, 0] as [number, number] | null },
    { name: 'center', anchor: [0.5, 0.5] as [number, number], origin: null },
    { name: 'off-canvas', anchor: [0.5, 0.5] as [number, number], origin: [180, -80] as [number, number] | null },
];

class PivotAndAnchorScene extends Scene {
    private _sprite!: Sprite;
    private _pivotMarker!: Graphics;
    private _label!: Text;
    private _mode = 0;
    private _timer = 0;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        this._sprite = new Sprite(loader.get(Texture, 'bunny')).setPosition(400, 300);
        this._pivotMarker = new Graphics();
        this._label = new Text('', { fillColor: Color.white, fontSize: 18 });
        this._label.setPosition(20, 20);
        this._applyMode();
    }

    private _applyMode(): void {
        const mode = modes[this._mode];
        this._sprite.setAnchor(mode.anchor[0], mode.anchor[1]);
        if (mode.origin) this._sprite.setOrigin(mode.origin[0], mode.origin[1]);
        this._label.text = `mode: ${mode.name}`;
    }

    override update(delta): void {
        this._timer += delta.seconds;
        this._sprite.rotate(delta.seconds * 90);
        if (this._timer > 1.8) {
            this._timer = 0;
            this._mode = (this._mode + 1) % modes.length;
            this._applyMode();
        }
    }

    override draw(context): void {
        const m = this._sprite.getGlobalTransform();
        context.backend.clear();
        context.render(this._sprite);
        this._pivotMarker.clear();
        this._pivotMarker.fillColor = new Color(255, 80, 80);
        this._pivotMarker.drawCircle(m.x, m.y, 5);
        context.render(this._pivotMarker);
        context.render(this._label);
    }
}

app.start(new PivotAndAnchorScene());
