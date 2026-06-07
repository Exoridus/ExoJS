// Auto-generated from multitouch.ts — edit the .ts source, not this file.
import { Application, Color, Graphics, Scene } from '@codexo/exojs';
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
const colors = [new Color(255, 100, 100), new Color(100, 255, 140), new Color(120, 170, 255), new Color(255, 220, 120), new Color(220, 120, 255)];
class MultitouchScene extends Scene {
    graphics;
    pointers;
    init() {
        this.graphics = new Graphics();
        this.pointers = new Map();
        this.app.input.onPointerDown.add(pointer => {
            if (this.pointers.size >= 5)
                return;
            if (!this.pointers.has(pointer.id))
                this.pointers.set(pointer.id, { x: pointer.x, y: pointer.y });
        });
        this.app.input.onPointerMove.add(pointer => {
            if (this.pointers.has(pointer.id))
                this.pointers.set(pointer.id, { x: pointer.x, y: pointer.y });
        });
        this.app.input.onPointerUp.add(pointer => {
            this.pointers.delete(pointer.id);
        });
        this.app.input.onPointerCancel.add(pointer => {
            this.pointers.delete(pointer.id);
        });
    }
    draw(context) {
        context.backend.clear();
        this.graphics.clear();
        let index = 0;
        for (const point of this.pointers.values()) {
            this.graphics.fillColor = colors[index % colors.length];
            this.graphics.drawCircle(point.x, point.y, 24);
            index++;
        }
        context.render(this.graphics);
    }
}
app.start(new MultitouchScene());
