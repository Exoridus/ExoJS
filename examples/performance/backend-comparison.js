import { Application, Color, Keyboard, Scene, Sprite, Texture } from '@codexo/exojs';
import { DebugOverlay } from '@codexo/exojs/debug';

const options = {
    canvas: {
        width: 800,
        height: 600,
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
    async load(loader) {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }
    init(loader) {
        this._sprites = [];
        for (let i = 0; i < 2200; i++) {
            const sprite = new Sprite(loader.get(Texture, 'bunny'));
            sprite.setAnchor(0.5);
            sprite.setScale(0.35);
            sprite.setPosition(Math.random() * 800, Math.random() * 600);
            sprite._vx = (Math.random() - 0.5) * 180;
            sprite._vy = (Math.random() - 0.5) * 180;
            this._sprites.push(sprite);
        }
        this.inputs.onTrigger(Keyboard.B, () => {
            backendType = backendType === 'webgpu' ? 'webgl2' : 'webgpu';
            boot(backendType);
        });
    }
    update(delta) {
        for (const sprite of this._sprites) {
            sprite.move(sprite._vx * delta.seconds, sprite._vy * delta.seconds);
            if (sprite.position.x < 0 || sprite.position.x > 800) sprite._vx *= -1;
            if (sprite.position.y < 0 || sprite.position.y > 600) sprite._vy *= -1;
        }
    }
    draw(context) {
        context.backend.clear();
        for (const sprite of this._sprites) context.render(sprite);
    }
}

const boot = type => {
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
    document.body.append(app.canvas);
    overlay = new DebugOverlay(app);
    overlay.layers.performance.visible = true;
    void app.start(new DemoScene());
};

boot(backendType);
