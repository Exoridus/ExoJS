import { Application, Color, Keyboard, Scene, Sprite, Texture } from '@codexo/exojs';
import { DebugOverlay } from '@codexo/exojs/debug';

const options = {
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit' as const,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
};

let app: Application | null = null;
let overlay: DebugOverlay | null = null;
let backendType: 'webgl2' | 'webgpu' = 'webgpu';

class DemoScene extends Scene {
    private sprites!: { sprite: Sprite; vx: number; vy: number }[];

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        this.sprites = Array.from({ length: 2200 }, () => {
            const sprite = new Sprite(loader.get(Texture, 'bunny'));
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

    override update(delta): void {
        const { width, height } = this.app.canvas;
        for (const item of this.sprites) {
            item.sprite.move(item.vx * delta.seconds, item.vy * delta.seconds);
            if (item.sprite.position.x < 0 || item.sprite.position.x > width) item.vx *= -1;
            if (item.sprite.position.y < 0 || item.sprite.position.y > height) item.vy *= -1;
        }
    }

    override draw(context): void {
        context.backend.clear();
        for (const { sprite } of this.sprites) context.render(sprite);
    }
}

const boot = (type: 'webgl2' | 'webgpu'): void => {
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
