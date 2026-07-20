// Auto-generated from graphics-gradient.ts — edit the .ts source, not this file.
import { Application, Color, Container, Graphics, LinearGradient, RadialGradient, Scene } from '@codexo/exojs';
class GraphicsGradientScene extends Scene {
    sceneRoot;
    panel;
    orb;
    ring;
    badge;
    init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        this.sceneRoot = new Container();
        this.sceneRoot.setPosition(width / 2, height / 2);
        this.panel = new Graphics();
        this.panel.fillStyle = new LinearGradient([
            { offset: 0, color: new Color(255, 90, 40, 1) },
            { offset: 0.5, color: new Color(255, 210, 70, 1) },
            { offset: 1, color: new Color(70, 120, 255, 1) },
        ], [0, 0], [1, 1]);
        this.panel.drawRectangle(-190, -130, 380, 260);
        this.orb = new Graphics();
        this.orb.fillStyle = new RadialGradient([
            { offset: 0, color: new Color(255, 255, 255, 1) },
            { offset: 0.4, color: new Color(120, 220, 255, 1) },
            { offset: 1, color: new Color(20, 40, 90, 1) },
        ], [0.5, 0.5], 0.5);
        this.orb.drawCircle(-96, -8, 56);
        this.ring = new Graphics();
        this.ring.lineWidth = 12;
        this.ring.strokeStyle = new RadialGradient([
            { offset: 0, color: new Color(255, 240, 180, 1) },
            { offset: 1, color: new Color(255, 80, 160, 1) },
        ], [0.5, 0.5], 0.5);
        this.ring.drawArc(104, 8, 52, 0, Math.PI * 2);
        this.badge = new Graphics();
        this.badge.fillStyle = new LinearGradient([
            { offset: 0, color: new Color(180, 255, 200, 1) },
            { offset: 1, color: new Color(40, 160, 120, 1) },
        ]);
        this.badge.drawStar(0, 116, 5, 46, 20);
        this.sceneRoot.addChild(this.panel, this.orb, this.ring, this.badge);
    }
    update(delta) {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        this.sceneRoot.rotate(delta.seconds * 8);
        this.badge.rotate(delta.seconds * 60);
        this.orb.setScale(1 + Math.sin(app.activeTime.seconds * 2) * 0.06);
    }
    draw(context) {
        context.backend.clear();
        context.render(this.sceneRoot);
    }
    destroy() {
        this.sceneRoot?.destroy();
    }
}
const app = new Application({
    scenes: { GraphicsGradientScene },
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.midnightBlue,
});
app.start(GraphicsGradientScene).catch(() => {
    app.canvas.remove();
    app.destroy();
});
