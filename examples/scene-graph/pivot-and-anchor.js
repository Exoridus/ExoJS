// Auto-generated from pivot-and-anchor.ts — edit the .ts source, not this file.
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
class PivotAndAnchorScene extends Scene {
    sprite;
    pivotMarker;
    label;
    mode = 0;
    timer = 0;
    async load(loader) {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }
    init(loader) {
        this.sprite = new Sprite(loader.get(Texture, 'bunny')).setPosition(400, 300);
        this.pivotMarker = new Graphics();
        this.label = new Text('', { fillColor: Color.white, fontSize: 18 });
        this.label.setPosition(20, 20);
        this.applyMode();
    }
    applyMode() {
        const mode = modes[this.mode];
        this.sprite.setAnchor(mode.anchor[0], mode.anchor[1]);
        if (mode.origin)
            this.sprite.setOrigin(mode.origin[0], mode.origin[1]);
        this.label.text = `mode: ${mode.name}`;
    }
    update(delta) {
        this.timer += delta.seconds;
        this.sprite.rotate(delta.seconds * 90);
        if (this.timer > 1.8) {
            this.timer = 0;
            this.mode = (this.mode + 1) % modes.length;
            this.applyMode();
        }
    }
    draw(context) {
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
app.start(new PivotAndAnchorScene());
