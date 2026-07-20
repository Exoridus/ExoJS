import { Application, Color, type RenderingContext, Scene, Sprite, type Time } from '@codexo/exojs';



class GameLoopScene extends Scene {
    private sprite!: Sprite;

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        this.sprite = new Sprite(this.loader.get('image/ship-a.png'));
        this.sprite.setAnchor(0.5);
        this.sprite.setPosition(width / 2, height / 2);
    }

    override update(delta: Time): void {
        this.sprite.rotate(delta.seconds * 120);
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.sprite);
    }
}

const app = new Application({
    scenes: { GameLoopScene },
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

app.start(GameLoopScene);
