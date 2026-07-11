import { Application, Color, Container, Graphics, type RenderingContext, Scene, type Time } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.midnightBlue,
    backend: { type: 'webgpu' },
});

class GraphicsPrimitivesScene extends Scene {
    private sceneRoot!: Container;
    private panel!: Graphics;
    private circle!: Graphics;
    private diamond!: Graphics;
    private star!: Graphics;

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        this.sceneRoot = new Container();
        this.sceneRoot.setPosition(width / 2, height / 2);

        this.panel = new Graphics();
        this.panel.fillColor = Color.darkSlateBlue;
        this.panel.drawRectangle(-190, -130, 380, 260);

        this.circle = new Graphics();
        this.circle.fillColor = Color.tomato;
        this.circle.drawCircle(-92, -6, 48);

        this.diamond = new Graphics();
        this.diamond.fillColor = Color.goldenrod;
        this.diamond.drawPolygon([0, -70, 70, 0, 0, 70, -70, 0]);

        this.star = new Graphics();
        this.star.fillColor = Color.mediumSeaGreen;
        this.star.drawStar(108, 12, 5, 58, 26, -18);

        this.sceneRoot.addChild(this.panel, this.circle, this.diamond, this.star);
    }

    override update(delta: Time): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        this.sceneRoot.rotate(delta.seconds * 9);
        this.star.rotate(delta.seconds * 60);
        this.circle.y = Math.sin(app.activeTime.seconds * 2) * 18;
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.sceneRoot);
    }

    override destroy(): void {
        this.sceneRoot?.destroy();
    }
}

app.start(new GraphicsPrimitivesScene()).catch(() => {
    app.canvas.remove();
    app.destroy();
});
