// Auto-generated from performance-overlay.ts — edit the .ts source, not this file.
import { Application, Color, Keyboard, Scene, Sprite, Texture } from '@codexo/exojs';
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
debug.layers.performance.visible = true;
class PerformanceOverlayScene extends Scene {
    sprites;
    async load(loader) {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }
    init(loader) {
        this.sprites = Array.from({ length: 1600 }, () => {
            const sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setScale(0.25);
            sprite.setPosition(Math.random() * 800, Math.random() * 600);
            return {
                sprite,
                vx: (Math.random() - 0.5) * 120,
                vy: (Math.random() - 0.5) * 120,
            };
        });
        this.inputs.onTrigger(Keyboard.P, () => {
            debug.layers.performance.visible = !debug.layers.performance.visible;
        });
    }
    update(delta) {
        for (const item of this.sprites) {
            item.sprite.move(item.vx * delta.seconds, item.vy * delta.seconds);
            if (item.sprite.position.x < 0 || item.sprite.position.x > 800)
                item.vx *= -1;
            if (item.sprite.position.y < 0 || item.sprite.position.y > 600)
                item.vy *= -1;
        }
    }
    draw(context) {
        context.backend.clear();
        for (const { sprite } of this.sprites)
            context.render(sprite);
    }
}
app.start(new PerformanceOverlayScene());
