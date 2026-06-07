// Auto-generated from camera-basic.ts — edit the .ts source, not this file.
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
    bunny;
    grid;
    uiBar;
    zoom = 1;
    async load(loader) {
        this.bunny = new Sprite(await loader.load(Texture, 'image/ship-a.png'));
    }
    init() {
        const { width } = this.app.canvas;
        this.bunny.setAnchor(0.5).setPosition(400, 300);
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
            this.app.rendering.camera.setCenter(p.x, p.y);
        });
        this.app.input.onMouseWheel.add(delta => {
            this.zoom = Math.max(0.2, Math.min(4, this.zoom - delta.y * 0.001));
            this.app.rendering.camera.setZoom(this.zoom);
        });
    }
    update(delta) {
        this.app.rendering.camera.rotation += delta.seconds * 15;
    }
    draw(context) {
        context.backend.clear();
        context.render(this.grid);
        context.render(this.bunny);
        // Render a simple UI bar through the screen-space view
        this.uiBar.clear();
        this.uiBar.fillColor = new Color(0, 0, 0, 0.6);
        this.uiBar.drawRectangle(0, 0, 800, 40);
        this.uiBar.fillColor = new Color(120, 220, 255);
        this.uiBar.drawRectangle(0, 38, 800, 2);
        context.render(this.uiBar, { view: context.screenView });
    }
}
app.start(new CameraBasicScene());
