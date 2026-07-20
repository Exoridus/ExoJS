import { Application, Color, Container, type RenderingContext, RenderTexture, Scene, Sprite, Texture } from '@codexo/exojs';



class RenderToTextureScene extends Scene {
    private container!: Container;
    private renderTexture!: RenderTexture;
    private renderSprite!: Sprite;

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        this.container = this.createBunnyContainer(this.loader.get('image/ship-a.png'));

        this.renderTexture = this.createRenderTexture(app.backend, this.container);

        this.renderSprite = new Sprite(this.renderTexture);
        this.renderSprite.setPosition(width, height);
        this.renderSprite.setAnchor(1, 1);
    }

    private createBunnyContainer(texture: Texture): Container {
        const container = new Container();

        for (let i = 0; i < 25; i++) {
            const bunny = new Sprite(texture);

            bunny.setAnchor(0.5, 0.5);
            bunny.setPosition(25 + (i % 5) * 30, 25 + Math.floor(i / 5) * 30);
            bunny.setRotation(Math.random() * 360);

            container.addChild(bunny);
        }

        return container;
    }

    private createRenderTexture(backend: Application['backend'], container: Container): RenderTexture {
        const renderTexture = new RenderTexture(Math.ceil(container.width), Math.ceil(container.height));

        backend.setRenderTarget(renderTexture);

        backend.clear();
        container.render(backend);

        backend.setRenderTarget(null);

        return renderTexture;
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.container);
        context.render(this.renderSprite);
    }
}

const app = new Application({
    scenes: { RenderToTextureScene },
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

app.start(RenderToTextureScene);
