// Auto-generated from world-vs-screen-coords.ts — edit the .ts source, not this file.
import { Application, Color, Graphics, Scene, Text, View } from '@codexo/exojs';
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
class WorldScreenScene extends Scene {
    view;
    grid;
    markers;
    text;
    pointer = { x: 0, y: 0 };
    init() {
        const { width, height } = this.app.canvas;
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
        this.app.input.onPointerMove.add(pointer => {
            this.pointer = { x: pointer.x, y: pointer.y };
        });
        this.app.input.onPointerTap.add(pointer => {
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
        const width = this.app.canvas.width;
        const height = this.app.canvas.height;
        const clipX = (screenX / width) * 2 - 1;
        const clipY = 1 - (screenY / height) * 2;
        const inverse = this.view.getInverseTransform();
        return {
            x: inverse.a * clipX + inverse.b * clipY + inverse.x,
            y: inverse.c * clipX + inverse.d * clipY + inverse.y,
        };
    }
}
app.start(new WorldScreenScene());
