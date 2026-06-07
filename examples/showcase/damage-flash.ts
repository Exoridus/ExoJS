import { Application, Color, ColorFilter, Scene, Signal, Sprite, Texture } from '@codexo/exojs';

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

class DamageFlashScene extends Scene {
    private hit!: Signal;
    private sprite!: Sprite;
    private filterColor!: Color;
    private filter!: ColorFilter;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        this.hit = new Signal();
        this.sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setScale(2.2).setPosition(400, 300);
        this.filterColor = new Color(255, 255, 255, 1);
        this.filter = new ColorFilter(this.filterColor);
        this.sprite.filters = [this.filter];
        this.hit.add(() => {
            this.filterColor.set(255, 120, 120, 1);
            this.app.tweens.create(this.filterColor).to({ r: 255, g: 255, b: 255 }, 0.2).start();
        });
        this.app.input.onPointerTap.add(() => {
            this.hit.dispatch();
        });
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.sprite);
    }
}

app.start(new DamageFlashScene());
