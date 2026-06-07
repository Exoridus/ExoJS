// Auto-generated from gradient.ts — edit the .ts source, not this file.
import { Application, Color, LinearGradient, RadialGradient, Scene, Sprite } from '@codexo/exojs';
const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
    backend: { type: 'webgl2' },
});
document.body.append(app.canvas);
class GradientScene extends Scene {
    backgroundGradient;
    background;
    orbGradient;
    orb;
    init() {
        const centerX = this.app.canvas.width / 2;
        const centerY = this.app.canvas.height / 2;
        this.backgroundGradient = new LinearGradient([
            { offset: 0, color: new Color(255, 90, 40, 1) },
            { offset: 0.45, color: new Color(255, 210, 70, 1) },
            { offset: 1, color: new Color(70, 90, 255, 1) },
        ], [0, 0], [1, 1]);
        this.background = new Sprite(this.backgroundGradient.toTexture(520, 280));
        this.background.setOrigin(0.5).setPosition(centerX, centerY);
        this.orbGradient = new RadialGradient([
            { offset: 0, color: new Color(255, 255, 255, 1) },
            { offset: 0.35, color: new Color(100, 220, 255, 0.8) },
            { offset: 1, color: new Color(20, 40, 90, 0.1) },
        ], [0.5, 0.5], 0.5);
        this.orb = new Sprite(this.orbGradient.toTexture(180, 180));
        this.orb.setOrigin(0.5).setPosition(centerX, centerY);
    }
    update(delta) {
        this.background.rotate(delta.seconds * 8);
        this.orb.rotate(-delta.seconds * 30);
        this.orb.setScale(1 + Math.sin(this.app.activeTime.seconds * 2) * 0.07);
    }
    draw(context) {
        context.backend.clear();
        context.render(this.background);
        context.render(this.orb);
    }
    unload() {
        this.background?.texture?.destroy();
        this.orb?.texture?.destroy();
        this.background?.destroy();
        this.orb?.destroy();
        this.backgroundGradient?.destroy();
        this.orbGradient?.destroy();
    }
    destroy() {
        this.unload();
    }
}
app.start(new GradientScene()).catch(() => {
    app.canvas.remove();
    app.destroy();
});
