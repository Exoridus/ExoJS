import { Application, Color, Container, RenderTexture, Scene, Sprite, Texture } from '@codexo/exojs';

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

class RenderToTextureScene extends Scene {
    private container!: Container;
    private renderTexture!: RenderTexture;
    private renderSprite!: Sprite;

    override async load(loader): Promise<void> {
        await loader.load('image/ship-a.png');
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        this.container = this.createBunnyContainer(loader.get('image/ship-a.png'));

        this.renderTexture = this.createRenderTexture(this.container);

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

    private createRenderTexture(container: Container): RenderTexture {
        const backend = this.app.backend;
        const renderTexture = new RenderTexture(Math.ceil(container.width), Math.ceil(container.height));

        backend.setRenderTarget(renderTexture);

        backend.clear();
        container.render(backend);

        backend.setRenderTarget(null);

        return renderTexture;
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.container);
        context.render(this.renderSprite);
    }
}

app.start(new RenderToTextureScene());
