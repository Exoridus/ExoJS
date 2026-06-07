import { Application, Color, Scene, Sprite, Texture } from '@codexo/exojs';

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

class SpriteBasicsScene extends Scene {
    private bunny!: Sprite;
    private tints!: Color[];
    private tintIndex = 0;
    private tintTime = 0;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        this.bunny = new Sprite(loader.get(Texture, 'bunny'));
        this.bunny.setPosition((width / 2) | 0, (height / 2) | 0);
        this.bunny.setAnchor(0.5);
        this.tints = [new Color(255, 120, 120), new Color(120, 255, 160), new Color(120, 180, 255)];
        this.bunny.setTint(this.tints[this.tintIndex]);
    }

    override update(delta): void {
        this.bunny.rotate(delta.seconds * 360);
        this.tintTime += delta.seconds;

        if (this.tintTime >= 0.5) {
            this.tintTime = 0;
            this.tintIndex = (this.tintIndex + 1) % this.tints.length;
            this.bunny.setTint(this.tints[this.tintIndex]);
        }
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.bunny);
    }
}

app.start(new SpriteBasicsScene());
