// Auto-generated from pivot-and-anchor.ts — edit the .ts source, not this file.
import { Application, Color, Graphics, Scene, Sprite, Text } from '@codexo/exojs';
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
    init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        this.sprite = new Sprite(this.loader.get('image/ship-a.png')).setPosition(width / 2, height / 2);
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
