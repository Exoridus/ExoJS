// Auto-generated from camera-basic.ts — edit the .ts source, not this file.
import { Application, Color, Graphics, Scene, Sprite } from '@codexo/exojs';
class CameraBasicScene extends Scene {
    bunny;
    grid;
    uiBar;
    zoom = 1;
    init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
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
        app.input.onMouseWheel.add(delta => {
            this.zoom = Math.max(0.2, Math.min(4, this.zoom - delta.y * 0.001));
            app.rendering.view.setZoom(this.zoom);
        });
    }
    update(delta) {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        app.rendering.view.rotation += delta.seconds * 15;
    }
    draw(context) {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width } = app.canvas;
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
const app = new Application({
    scenes: { CameraBasicScene },
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
app.start(CameraBasicScene);
