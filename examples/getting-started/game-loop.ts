import { Application, Color, Scene, Sprite } from '@codexo/exojs';

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

class GameLoopScene extends Scene {
    private sprite!: Sprite;

    override init(): void {
        const { width, height } = this.app.canvas;

        this.sprite = new Sprite(this.loader.get('image/ship-a.png'));
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
