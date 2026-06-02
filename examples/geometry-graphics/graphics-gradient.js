import { Application, Color, Container, Graphics, LinearGradient, RadialGradient, Scene } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.midnightBlue,
});

document.body.append(app.canvas);

app.start(
    new (class extends Scene {
        init() {
            const { width, height } = this.app.canvas;

            this._sceneRoot = new Container();
            this._sceneRoot.setPosition(width / 2, height / 2);

            // Rectangle filled with a diagonal linear gradient.
            this._panel = new Graphics();
            this._panel.fillStyle = new LinearGradient(
                [
                    { offset: 0, color: new Color(255, 90, 40, 1) },
                    { offset: 0.5, color: new Color(255, 210, 70, 1) },
                    { offset: 1, color: new Color(70, 120, 255, 1) },
                ],
                [0, 0],
                [1, 1]
            );
            this._panel.drawRectangle(-190, -130, 380, 260);

            // Circle filled with a radial gradient (bright core fading outward).
            this._orb = new Graphics();
            this._orb.fillStyle = new RadialGradient(
                [
                    { offset: 0, color: new Color(255, 255, 255, 1) },
                    { offset: 0.4, color: new Color(120, 220, 255, 1) },
                    { offset: 1, color: new Color(20, 40, 90, 1) },
                ],
                [0.5, 0.5],
                0.5
            );
            this._orb.drawCircle(-96, -8, 56);

            // Outline stroked with a radial gradient — no fill, just the ring.
            this._ring = new Graphics();
            this._ring.lineWidth = 12;
            this._ring.strokeStyle = new RadialGradient(
                [
                    { offset: 0, color: new Color(255, 240, 180, 1) },
                    { offset: 1, color: new Color(255, 80, 160, 1) },
                ],
                [0.5, 0.5],
                0.5
            );
            this._ring.drawArc(104, 8, 52, 0, Math.PI * 2);

            // Star with a linear-gradient fill, spun on its own pivot below.
            this._badge = new Graphics();
            this._badge.fillStyle = new LinearGradient([
                { offset: 0, color: new Color(180, 255, 200, 1) },
                { offset: 1, color: new Color(40, 160, 120, 1) },
            ]);
            this._badge.drawStar(0, 116, 5, 46, 20);

            this._sceneRoot.addChild(this._panel, this._orb, this._ring, this._badge);
        }
        update(delta) {
            // The whole group is a transformed Graphics container.
            this._sceneRoot.rotate(delta.seconds * 8);
            this._badge.rotate(delta.seconds * 60);
            this._orb.setScale(1 + Math.sin(this.app.activeTime.seconds * 2) * 0.06);
        }
        draw(context) {
            context.backend.clear();
            context.render(this._sceneRoot);
        }
        unload() {
            this._sceneRoot?.destroy();
            this._sceneRoot = null;
            this._panel = null;
            this._orb = null;
            this._ring = null;
            this._badge = null;
        }
        destroy() {
            this.unload();
        }
    })()
).catch(error => {
    app.canvas.remove();
    app.destroy();

    throw error;
});
