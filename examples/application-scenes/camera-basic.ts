import { Application, Color, Graphics, Scene, Sprite } from '@codexo/exojs';

const app = new Application({
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

class CameraBasicScene extends Scene {
    private bunny!: Sprite;
    private grid!: Graphics;
    private uiBar!: Graphics;
    private zoom = 1;

    override async load(loader): Promise<void> {
        this.bunny = new Sprite(await loader.load('image/ship-a.png'));
    }

    override init(): void {
        const { width, height } = this.app.canvas;

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

        this.app.input.onPointerMove.add(p => {
            this.app.rendering.view.setCenter(p.x, p.y);
        });

        this.app.input.onMouseWheel.add(delta => {
            this.zoom = Math.max(0.2, Math.min(4, this.zoom - delta.y * 0.001));
            this.app.rendering.view.setZoom(this.zoom);
        });
    }

    override update(delta): void {
        this.app.rendering.view.rotation += delta.seconds * 15;
    }

    override draw(context): void {
        const { width } = this.app.canvas;

        context.backend.clear();
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

app.start(new CameraBasicScene());
