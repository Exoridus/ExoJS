import { Application, Color, GradientDrawable, Scene } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
    backend: { type: 'webgl2' },
});

document.body.append(app.canvas);

app.start(
    new (class extends Scene {
        init() {
            const centerX = this.app.canvas.width / 2;
            const centerY = this.app.canvas.height / 2;

            this._background = new GradientDrawable({
                width: 520,
                height: 280,
                mode: 'linear',
                linearStart: [0, 0],
                linearEnd: [1, 1],
                stops: [
                    { offset: 0, color: new Color(255, 90, 40, 1) },
                    { offset: 0.45, color: new Color(255, 210, 70, 1) },
                    { offset: 1, color: new Color(70, 90, 255, 1) },
                ],
            });
            this._background.setOrigin(0.5).setPosition(centerX, centerY);

            this._orb = new GradientDrawable({
                width: 180,
                height: 180,
                mode: 'radial',
                radialCenter: [0.5, 0.5],
                radialRadius: 0.5,
                stops: [
                    { offset: 0, color: new Color(255, 255, 255, 1) },
                    { offset: 0.35, color: new Color(100, 220, 255, 0.8) },
                    { offset: 1, color: new Color(20, 40, 90, 0.1) },
                ],
            });
            this._orb.setOrigin(0.5).setPosition(centerX, centerY);
        }
        update(delta) {
            this._background.rotate(delta.seconds * 8);
            this._orb.rotate(-delta.seconds * 30);
            this._orb.setScale(1 + Math.sin(this.app.activeTime.seconds * 2) * 0.07);
        }
        draw(backend) {
            backend.clear();
            this._background.render(backend);
            this._orb.render(backend);
        }
        unload() {
            this._background?.destroy();
            this._orb?.destroy();
            this._background = null;
            this._orb = null;
        }
        destroy() {
            this._background?.destroy();
            this._orb?.destroy();
            this._background = null;
            this._orb = null;
        }
    })()
).catch(error => {
    app.canvas.remove();
    app.destroy();

    throw error;
});
