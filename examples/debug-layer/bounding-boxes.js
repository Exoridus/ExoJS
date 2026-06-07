// Auto-generated from bounding-boxes.ts — edit the .ts source, not this file.
import { Application, Color, Scene, Sprite, Texture } from '@codexo/exojs';
import { DebugOverlay } from '@codexo/exojs/debug';
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
const debug = new DebugOverlay(app);
debug.layers.boundingBoxes.visible = true;
class BoundingBoxesScene extends Scene {
    sprites;
    time = 0;
    async load(loader) {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }
    init(loader) {
        this.sprites = Array.from({ length: 7 }, (_, i) => {
            const sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setScale(0.8);
            sprite.setPosition(120 + i * 90, 300 + Math.sin(i) * 80);
            return { sprite, speed: 0.8 + i * 0.14 };
        });
    }
    update(delta) {
        this.time += delta.seconds;
        for (const { sprite, speed } of this.sprites) {
            sprite.setRotation(this.time * 35 * speed);
            sprite.setPosition(sprite.position.x, 300 + Math.sin(this.time * speed) * 100);
        }
    }
    draw(context) {
        context.backend.clear();
        for (const { sprite } of this.sprites)
            context.render(sprite);
    }
}
app.start(new BoundingBoxesScene());
