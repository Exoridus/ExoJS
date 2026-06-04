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
    private _sprites!: { sprite: Sprite; speed: number }[];
    private _time = 0;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        this._sprites = Array.from({ length: 7 }, (_, i) => {
            const sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setScale(0.8);
            sprite.setPosition(120 + i * 90, 300 + Math.sin(i) * 80);
            return { sprite, speed: 0.8 + i * 0.14 };
        });
    }

    override update(delta): void {
        this._time += delta.seconds;
        for (const { sprite, speed } of this._sprites) {
            sprite.setRotation(this._time * 35 * speed);
            sprite.setPosition(sprite.position.x, 300 + Math.sin(this._time * speed) * 100);
        }
    }

    override draw(context): void {
        context.backend.clear();
        for (const { sprite } of this._sprites) context.render(sprite);
    }
}

app.start(new BoundingBoxesScene());
