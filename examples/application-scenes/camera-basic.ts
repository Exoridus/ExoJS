import { Application, Color, Graphics, Scene, Sprite, Texture } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
});

document.body.append(app.canvas);

class CameraBasicScene extends Scene {
    private _bunny!: Sprite;
    private _grid!: Graphics;
    private _uiBar!: Graphics;
    private _zoom = 1;

    override async load(loader): Promise<void> {
        this._bunny = new Sprite(await loader.load(Texture, 'image/ship-a.png'));
    }

    override init(): void {
        const { width } = this.app.canvas;

        this._bunny.setAnchor(0.5).setPosition(400, 300);

        this._grid = new Graphics();
        this._grid.lineWidth = 1;
        this._grid.lineColor = new Color(255, 255, 255, 0.15);

        for (let x = -1000; x <= 1000; x += 50) {
            this._grid.drawLine(x, -1000, x, 1000);
        }

        for (let y = -1000; y <= 1000; y += 50) {
            this._grid.drawLine(-1000, y, 1000, y);
        }

        this._uiBar = new Graphics();
        this._uiBar.fillColor = new Color(0, 0, 0, 0.6);
        this._uiBar.drawRectangle(0, 0, width, 40);

        this.app.input.onPointerMove.add(p => {
            this.app.rendering.camera.setCenter(p.x, p.y);
        });

        this.app.input.onMouseWheel.add(delta => {
            this._zoom = Math.max(0.2, Math.min(4, this._zoom - delta.y * 0.001));
            this.app.rendering.camera.setZoom(this._zoom);
        });
    }

    override update(delta): void {
        this.app.rendering.camera.rotation += delta.seconds * 15;
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._grid);
        context.render(this._bunny);

        // Render a simple UI bar through the screen-space view
        this._uiBar.clear();
        this._uiBar.fillColor = new Color(0, 0, 0, 0.6);
        this._uiBar.drawRectangle(0, 0, 800, 40);
        this._uiBar.fillColor = new Color(120, 220, 255);
        this._uiBar.drawRectangle(0, 38, 800, 2);
        context.render(this._uiBar, { view: context.screenView });
    }
}

app.start(new CameraBasicScene());
