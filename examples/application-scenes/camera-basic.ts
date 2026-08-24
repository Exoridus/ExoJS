import { Application, Color, FixedResolutionCanvasSizing, Graphics, type RenderingContext, Scene, Sprite, type Time } from '@codexo/exojs';



class CameraBasicScene extends Scene {
    private bunny!: Sprite;
    private grid!: Graphics;
    private uiBar!: Graphics;
    private zoom = 1;

    override init(): void {
        const app = this.app;
        const { width, height } = app;

        this.bunny = new Sprite(this.loader.get('image/ship-a.png'));
        this.bunny.setAnchor(0.5).setPosition(width / 2, height / 2);

        this.grid = new Graphics();
        this.grid.lineWidth = 1;
        this.grid.lineColor = new Color(255, 255, 255, 0.15);

        for (let x = -1000; x <= 1000; x += 50) {
            this.grid.drawLine(x, -1000, x, 1000);
        }

        for (let y = -1000; y <= 1000; y += 50) {
            this.grid.drawLine(-1000, y, 1000, y);
        }

        this.uiBar = new Graphics();
        this.uiBar.fillColor = new Color(0, 0, 0, 0.6);
        this.uiBar.drawRectangle(0, 0, width, 40);

        app.input.onPointerMove.add(p => {
            app.rendering.view.setCenter(p.x, p.y);
        });

        app.input.onMouseWheel.add((_deltaX, deltaY) => {
            this.zoom = Math.max(0.2, Math.min(4, this.zoom - deltaY * 0.001));
            app.rendering.view.setZoom(this.zoom);
        });
    }

    override update(delta: Time): void {
        const app = this.app;
        app.rendering.view.rotation += delta.seconds * 15;
    }

    override draw(context: RenderingContext): void {
        const app = this.app;
        const { width } = app;

        context.render(this.grid);
        context.render(this.bunny);

        // Render a simple UI bar through the screen-space view
        this.uiBar.clear();
        this.uiBar.fillColor = new Color(0, 0, 0, 0.6);
        this.uiBar.drawRectangle(0, 0, width, 40);
        this.uiBar.fillColor = new Color(120, 220, 255);
        this.uiBar.drawRectangle(0, 38, width, 2);
        context.render(this.uiBar, { view: context.screenView });
    }
}

const app = new Application({
    scenes: { CameraBasicScene },
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizing: new FixedResolutionCanvasSizing(),
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});

app.start(CameraBasicScene);
