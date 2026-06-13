import { Application, Color, Graphics, Scene, Sprite, Texture } from '@codexo/exojs';
import { mountControls } from '@examples/runtime';

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

const CLEAR_TINT = new Color(120, 200, 255);
const OVERLAP_TINT = new Color(255, 90, 90);

class RectanglesCollisionScene extends Scene {
    private boxA!: Sprite;
    private boxB!: Sprite;
    private overlap!: Graphics;
    private hud!: ReturnType<typeof mountControls>;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { gradient: 'image/hue-ramp.png' });
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;
        const texture = loader.get(Texture, 'gradient');

        // Two axis-aligned rectangles (no rotation) so collision is a true AABB
        // test. Explicit width/height drive the sprite scale; anchor 0.5 keeps the
        // drag offset and the bounds centred on the pointer-grabbed point.
        this.boxA = this.makeBox(texture, 220, 150);
        this.boxA.setPosition(width / 2 - 180, height / 2);

        this.boxB = this.makeBox(texture, 170, 200);
        this.boxB.setPosition(width / 2 + 180, height / 2);

        this.overlap = new Graphics();

        this.hud = mountControls({
            title: 'Rectangles Collision',
            controls: [{ keys: 'Drag', action: 'move a rectangle' }],
            status: 'No overlap',
            hint: 'Drag either rectangle over the other — the AABB overlap region lights up.',
        });
    }

    private makeBox(texture: Texture, w: number, h: number): Sprite {
        const box = new Sprite(texture).setAnchor(0.5);
        box.width = w;
        box.height = h;
        box.setTint(CLEAR_TINT);
        box.interactive = true;
        box.draggable = true;
        return box;
    }

    override update(): void {
        const overlapping = this.boxA.intersectsWith(this.boxB);

        this.boxA.setTint(overlapping ? OVERLAP_TINT : CLEAR_TINT);
        this.boxB.setTint(overlapping ? OVERLAP_TINT : CLEAR_TINT);

        this.overlap.clear();

        if (overlapping) {
            const a = this.boxA.getBounds();
            const b = this.boxB.getBounds();
            const left = Math.max(a.left, b.left);
            const top = Math.max(a.top, b.top);
            const right = Math.min(a.right, b.right);
            const bottom = Math.min(a.bottom, b.bottom);
            const w = Math.max(0, right - left);
            const h = Math.max(0, bottom - top);

            this.overlap.fillColor = new Color(255, 255, 255, 0.85);
            this.overlap.drawRectangle(left, top, w, h);
            this.hud.setStatus(`OVERLAP — ${Math.round(w)}×${Math.round(h)} px`);
        } else {
            this.hud.setStatus('No overlap');
        }
    }

    override draw(context): void {
        context.backend.clear(new Color(18, 22, 30));
        context.render(this.boxA);
        context.render(this.boxB);
        context.render(this.overlap);
    }
}

app.start(new RectanglesCollisionScene());
