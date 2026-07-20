// Auto-generated from world-vs-screen-coords.ts — edit the .ts source, not this file.
import { Application, Color, Graphics, Scene, Text, View } from '@codexo/exojs';
class WorldScreenScene extends Scene {
    view;
    grid;
    markers;
    text;
    pointer = { x: 0, y: 0 };
    init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const width = app.width;
        const height = app.height;
        this.view = new View(260, 160, width, height);
        this.grid = new Graphics();
        this.markers = new Graphics();
        this.text = new Text('', { fillColor: Color.white, fontSize: 16 });
        this.grid.lineWidth = 1;
        this.grid.lineColor = new Color(60, 60, 60);
        for (let x = -200; x <= 1200; x += 100) {
            this.grid.drawLine(x, -200, x, 1000);
        }
        for (let y = -200; y <= 1000; y += 100) {
            this.grid.drawLine(-200, y, 1200, y);
        }
        app.input.onPointerMove.add(pointer => {
            this.pointer = { x: pointer.x, y: pointer.y };
        });
        app.input.onPointerTap.add(pointer => {
            const world = this.toWorld(pointer.x, pointer.y);
            this.markers.fillColor = new Color(255, 220, 80);
            this.markers.drawCircle(world.x, world.y, 8);
        });
    }
    draw(context) {
        const world = this.toWorld(this.pointer.x, this.pointer.y);
        this.text.text = `screen: ${this.pointer.x | 0}, ${this.pointer.y | 0}\nworld: ${world.x | 0}, ${world.y | 0}`;
        this.text.setPosition(12, 12);
        context.backend.clear();
        context.backend.setView(this.view);
        context.render(this.grid);
        context.render(this.markers);
        context.backend.setView(null);
        context.render(this.text);
    }
    toWorld(screenX, screenY) {
        // Pointer coordinates are already in design space, so screenToWorld only
        // has to undo this view's camera transform (pan/zoom) to reach world space.
        return this.view.screenToWorld(screenX, screenY);
    }
}
const app = new Application({
    scenes: { WorldScreenScene },
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
app.start(WorldScreenScene);
