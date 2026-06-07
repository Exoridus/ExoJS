// Auto-generated from mouse-and-pointer.ts — edit the .ts source, not this file.
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
class MouseAndPointerScene extends Scene {
    sprite;
    crosshair;
    pointer = { x: 400, y: 300 };
    async load(loader) {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }
    init(loader) {
        this.sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setPosition(400, 300);
        this.sprite.interactive = true;
        this.sprite.draggable = true;
        this.crosshair = new Graphics();
        this.app.input.onPointerMove.add(pointer => {
            this.pointer = { x: pointer.x, y: pointer.y };
        });
    }
    draw(context) {
        context.backend.clear();
        context.render(this.sprite);
        this.crosshair.clear();
        this.crosshair.lineWidth = 2;
        this.crosshair.lineColor = new Color(255, 220, 80);
        this.crosshair.drawLine(this.pointer.x - 10, this.pointer.y, this.pointer.x + 10, this.pointer.y);
        this.crosshair.drawLine(this.pointer.x, this.pointer.y - 10, this.pointer.x, this.pointer.y + 10);
        context.render(this.crosshair);
    }
}
app.start(new MouseAndPointerScene());
