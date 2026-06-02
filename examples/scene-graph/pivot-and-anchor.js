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
    { name: 'corner', anchor: [0, 0], origin: [0, 0] },
    { name: 'center', anchor: [0.5, 0.5], origin: null },
    { name: 'off-canvas', anchor: [0.5, 0.5], origin: [180, -80] },
];

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { bunny: 'image/ship-a.png' });
        }
        init(loader) {
            this._sprite = new Sprite(loader.get(Texture, 'bunny')).setPosition(400, 300);
            this._pivotMarker = new Graphics();
            this._label = new Text('', { fillColor: Color.white, fontSize: 18 });
            this._label.setPosition(20, 20);
            this._mode = 0;
            this._timer = 0;
            this._applyMode();
        }
        _applyMode() {
            const mode = modes[this._mode];
            this._sprite.setAnchor(mode.anchor[0], mode.anchor[1]);
            if (mode.origin) this._sprite.setOrigin(mode.origin[0], mode.origin[1]);
            this._label.text = `mode: ${mode.name}`;
        }
        update(delta) {
            this._timer += delta.seconds;
            this._sprite.rotate(delta.seconds * 90);
            if (this._timer > 1.8) {
                this._timer = 0;
                this._mode = (this._mode + 1) % modes.length;
                this._applyMode();
            }
        }
        draw(context) {
            const m = this._sprite.getGlobalTransform();
            context.backend.clear();
            context.render(this._sprite);
            this._pivotMarker.clear();
            this._pivotMarker.fillColor = new Color(255, 80, 80);
            this._pivotMarker.drawCircle(m.x, m.y, 5);
            context.render(this._pivotMarker);
            context.render(this._label);
        }
    })()
);
