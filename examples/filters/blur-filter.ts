import { assets } from '@assets';
import { Application, BlurFilter, Color, Graphics, Scene, Sprite, Texture } from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});

document.body.append(app.canvas);

const PIXEL_GRID = assets.technical.filtering.pixelGrid128;

class BlurFilterScene extends Scene {
    private blur!: BlurFilter;
    private sprite!: Sprite;
    private ui!: Graphics;
    private drag = false;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { grid: PIXEL_GRID });
    }

    override init(loader): void {
        this.blur = new BlurFilter({ radius: 2, quality: 2 });
        this.sprite = new Sprite(loader.get(Texture, 'grid')).setAnchor(0.5).setScale(3.5).setPosition(400, 280);
        this.sprite.filters = [this.blur];
        this.ui = new Graphics();

        this.app.input.onPointerDown.add(p => {
            this.drag = p.y > 500;
            this.setBlurFromX(p.x);
        });
        this.app.input.onPointerMove.add(p => {
            this.setBlurFromX(p.x);
        });
        this.app.input.onPointerUp.add(() => {
            this.drag = false;
        });
    }

    private setBlurFromX(x: number): void {
        if (!this.drag) return;
        const t = Math.max(0, Math.min(1, (x - 180) / 440));
        this.blur.radius = t * 14;
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.sprite);
        this.ui.clear();
        this.ui.fillColor = new Color(60, 60, 60);
        this.ui.drawRectangle(180, 510, 440, 14);
        this.ui.fillColor = new Color(130, 220, 255);
        this.ui.drawRectangle(180, 510, (this.blur.radius / 14) * 440, 14);
        context.render(this.ui);
    }
}

app.start(new BlurFilterScene());
