// Auto-generated from performance-overlay.ts — edit the .ts source, not this file.
import { Application, Color, Container, Keyboard, Scene, Sprite } from '@codexo/exojs';
import { DebugOverlay } from '@codexo/exojs/debug';
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
const debug = new DebugOverlay(app);
debug.layers.performance.visible = true;
class PerformanceOverlayScene extends Scene {
    sprites;
    layer;
    async load(loader) {
        await loader.load('image/ship-a.png');
    }
    init(loader) {
        const { width, height } = this.app.canvas;
        // All sprites share one texture, so adding them to a single container and
        // rendering it once lets the renderer batch them into a single draw call.
        // Rendering each sprite with its own `context.render(sprite)` call would
        // instead emit one draw call per sprite and tank the frame rate.
        this.layer = new Container();
        this.sprites = Array.from({ length: 1600 }, () => {
            const sprite = new Sprite(loader.get('image/ship-a.png')).setAnchor(0.5).setScale(0.25);
            sprite.setPosition(Math.random() * width, Math.random() * height);
            this.layer.addChild(sprite);
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
        const { width, height } = this.app.canvas;
        for (const item of this.sprites) {
            item.sprite.move(item.vx * delta.seconds, item.vy * delta.seconds);
            if (item.sprite.position.x < 0 || item.sprite.position.x > width)
                item.vx *= -1;
            if (item.sprite.position.y < 0 || item.sprite.position.y > height)
                item.vy *= -1;
        }
    }
    draw(context) {
        context.backend.clear();
        context.render(this.layer);
    }
}
app.start(new PerformanceOverlayScene());
