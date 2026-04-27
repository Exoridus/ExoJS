import { Application, Color, Container, Graphics, RenderTexture, Scene, Sprite } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: new Color(0.04, 0.06, 0.11, 1),
    backend: { type: 'webgpu' },
});

document.body.append(app.canvas);

app.start(Scene.create({

    init() {
        const { width, height } = this.app.canvas;

        this._offscreenTexture = new RenderTexture(256, 256);
        this._offscreenRoot = new Container();
        this._offscreenRoot.setPosition(128, 128);

        this._panel = new Graphics();
        this._panel.fillColor = new Color(0.09, 0.13, 0.23, 1);
        this._panel.drawRectangle(-108, -108, 216, 216);

        this._ring = new Graphics();
        this._ring.fillColor = Color.orange;
        this._ring.drawCircle(0, 0, 74);

        this._centerDiamond = new Graphics();
        this._centerDiamond.fillColor = Color.deepSkyBlue;
        this._centerDiamond.drawPolygon([
            0, -42,
            42, 0,
            0, 42,
            -42, 0,
        ]);

        this._cornerStar = new Graphics();
        this._cornerStar.fillColor = Color.limeGreen;
        this._cornerStar.setPosition(62, -58);
        this._cornerStar.drawStar(0, 0, 5, 24, 11, -18);

        this._offscreenRoot.addChild(
            this._panel,
            this._ring,
            this._centerDiamond,
            this._cornerStar
        );

        this._displaySprite = new Sprite(this._offscreenTexture);
        this._displaySprite.setAnchor(0.5);
        this._displaySprite.setPosition(width / 2, height / 2);
        this._displaySprite.setScale(1.85);
    },

    update(delta) {
        const time = this.app.activeTime.seconds;

        this._offscreenRoot.rotate(delta.seconds * 16);
        this._ring.setScale(0.9 + Math.sin(time * 2.4) * 0.18);
        this._centerDiamond.rotate(delta.seconds * 76);
        this._cornerStar.rotate(delta.seconds * -120);

        this._displaySprite.rotate(delta.seconds * -14);

        const displayScale = 1.75 + Math.sin(time * 1.7) * 0.2;
        this._displaySprite.setScale(displayScale);
    },

    draw(renderManager) {
        renderManager.setRenderTarget(this._offscreenTexture);
        renderManager.clear(new Color(0.02, 0.03, 0.06, 1));
        this._offscreenRoot.render(renderManager);

        renderManager.setRenderTarget(null);
        renderManager.clear();
        this._displaySprite.render(renderManager);
    },

    unload() {
        this._offscreenRoot?.destroy();
        this._displaySprite?.destroy();
        this._offscreenTexture?.destroy();
        this._offscreenRoot = null;
        this._offscreenTexture = null;
        this._displaySprite = null;
        this._panel = null;
        this._ring = null;
        this._centerDiamond = null;
        this._cornerStar = null;
    },

    destroy() {
        this._offscreenRoot?.destroy();
        this._displaySprite?.destroy();
        this._offscreenTexture?.destroy();
        this._offscreenRoot = null;
        this._offscreenTexture = null;
        this._displaySprite = null;
        this._panel = null;
        this._ring = null;
        this._centerDiamond = null;
        this._cornerStar = null;
    },
})).catch((error) => {
    app.canvas.remove();
    app.destroy();

    throw error;
});

