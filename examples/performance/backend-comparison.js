// Auto-generated from backend-comparison.ts — edit the .ts source, not this file.
import { Application, Color, Keyboard, Scene, Sprite } from '@codexo/exojs';
import { DebugOverlay } from '@codexo/exojs/debug';
const options = {
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
};
let app = null;
let overlay = null;
let backendType = 'webgpu';
class DemoScene extends Scene {
    sprites;
    async load(loader) {
        await loader.load('image/ship-a.png');
    }
    init(loader) {
        const { width, height } = this.app.canvas;
        this.sprites = Array.from({ length: 2200 }, () => {
            const sprite = new Sprite(loader.get('image/ship-a.png'));
            sprite.setAnchor(0.5);
            sprite.setScale(0.35);
            sprite.setPosition(Math.random() * width, Math.random() * height);
            return {
                sprite,
                vx: (Math.random() - 0.5) * 180,
                vy: (Math.random() - 0.5) * 180,
            };
        });
        this.inputs.onTrigger(Keyboard.B, () => {
            backendType = backendType === 'webgpu' ? 'webgl2' : 'webgpu';
            boot(backendType);
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
        for (const { sprite } of this.sprites)
            context.render(sprite);
    }
}
const boot = (type) => {
    if (overlay !== null) {
        overlay.destroy();
        overlay = null;
    }
    if (app !== null) {
        app.destroy();
        app.canvas.remove();
        app = null;
    }
    app = new Application({ ...options, backend: { type } });
    overlay = new DebugOverlay(app);
    overlay.layers.performance.visible = true;
    void app.start(new DemoScene());
};
boot(backendType);
