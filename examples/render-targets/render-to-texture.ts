import { Application, Color, Container, RenderTexture, Scene, Sprite, Texture } from '@codexo/exojs';

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

class RenderToTextureScene extends Scene {
    private _container!: Container;
    private _renderTexture!: RenderTexture;
    private _renderSprite!: Sprite;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png' });
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        this._container = this.createBunnyContainer(loader.get(Texture, 'bunny'));

        this._renderTexture = this.createRenderTexture(this._container);

        this._renderSprite = new Sprite(this._renderTexture);
        this._renderSprite.setPosition(width, height);
        this._renderSprite.setAnchor(1, 1);
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
        context.render(this._container);
        context.render(this._renderSprite);
    }
}

app.start(new RenderToTextureScene());
