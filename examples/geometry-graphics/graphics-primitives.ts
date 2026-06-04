import { Application, Color, Container, Graphics, Scene } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.midnightBlue,
    backend: { type: 'webgpu' },
});

document.body.append(app.canvas);

class GraphicsPrimitivesScene extends Scene {
    private _sceneRoot!: Container;
    private _panel!: Graphics;
    private _circle!: Graphics;
    private _diamond!: Graphics;
    private _star!: Graphics;

    override init(): void {
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
        this._diamond.drawPolygon([0, -70, 70, 0, 0, 70, -70, 0]);

        this._star = new Graphics();
        this._star.fillColor = Color.mediumSeaGreen;
        this._star.drawStar(108, 12, 5, 58, 26, -18);

        this._sceneRoot.addChild(this._panel, this._circle, this._diamond, this._star);
    }

    override update(delta): void {
        this._sceneRoot.rotate(delta.seconds * 9);
        this._star.rotate(delta.seconds * 60);
        this._circle.y = Math.sin(this.app.activeTime.seconds * 2) * 18;
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._sceneRoot);
    }

    override unload(): void {
        this._sceneRoot?.destroy();
    }

    override destroy(): void {
        this._sceneRoot?.destroy();
    }
}

app.start(new GraphicsPrimitivesScene()).catch(() => {
    app.canvas.remove();
    app.destroy();
});
