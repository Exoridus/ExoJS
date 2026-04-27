import { Application, Color, Container, Graphics, Scene } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.midnightBlue,
    backend: { type: 'webgpu' },
});

document.body.append(app.canvas);

app.start(Scene.create({

    init() {
        const { width, height } = this.app.canvas;

        this._sceneRoot = new Container();
        this._sceneRoot.setPosition(width / 2, height / 2);

        this._panel = new Graphics();
        this._panel.fillColor = Color.darkSlateBlue;
        this._panel.drawRectangle(-190, -130, 380, 260);

        this._circle = new Graphics();
        this._circle.fillColor = Color.tomato;
        this._circle.drawCircle(-92, -6, 48);

        this._diamond = new Graphics();
        this._diamond.fillColor = Color.goldenrod;
        this._diamond.drawPolygon([
            0, -70,
            70, 0,
            0, 70,
            -70, 0,
        ]);

        this._star = new Graphics();
        this._star.fillColor = Color.mediumSeaGreen;
        this._star.drawStar(108, 12, 5, 58, 26, -18);

        this._sceneRoot.addChild(this._panel, this._circle, this._diamond, this._star);
    },

    update(delta) {
        this._sceneRoot.rotate(delta.seconds * 9);
        this._star.rotate(delta.seconds * 60);
        this._circle.y = Math.sin(this.app.activeTime.seconds * 2) * 18;
    },

    draw(renderManager) {
        renderManager.clear();
        this._sceneRoot.render(renderManager);

    },

    unload() {
        this._sceneRoot?.destroy();
        this._sceneRoot = null;
        this._panel = null;
        this._circle = null;
        this._diamond = null;
        this._star = null;
    },

    destroy() {
        this._sceneRoot?.destroy();
        this._sceneRoot = null;
        this._panel = null;
        this._circle = null;
        this._diamond = null;
        this._star = null;
    },
})).catch((error) => {
    app.canvas.remove();
    app.destroy();

    throw error;
});

