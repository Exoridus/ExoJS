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

class GameLoopScene extends Scene {
    private sprite!: Sprite;

    override async load(loader): Promise<void> {
        this.sprite = new Sprite(await loader.load(Texture, 'image/ship-a.png'));
    }

    override init(): void {
        const { width, height } = this.app.canvas;

        this.sprite.setAnchor(0.5);
        this.sprite.setPosition(width / 2, height / 2);
    }

    override update(delta): void {
        this.sprite.rotate(delta.seconds * 120);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.sprite);
    }
}

app.start(new GameLoopScene());
