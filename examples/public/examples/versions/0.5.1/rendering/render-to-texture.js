import { Application, Color, Scene, Sprite, Container, RenderTexture, Texture } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

app.start(new Scene({

    async load(loader) {
        await loader.load(Texture, { bunny: 'image/bunny.png' });
    },
    init(loader) {
        const { width, height } = this.app.canvas;

        this._container = this.createBunnyContainer(loader.get(Texture, 'bunny'));

        this._renderTexture = this.createRenderTexture(this._container);

        this._renderSprite = new Sprite(this._renderTexture);
        this._renderSprite.setPosition(width, height);
        this._renderSprite.setAnchor(1, 1);
    },

    createBunnyContainer(texture) {
        const container = new Container();

        for (let i = 0; i < 25; i++) {
            const bunny = new Sprite(texture);

            bunny.setAnchor(0.5, 0.5);
            bunny.setPosition(25 + (i % 5) * 30, 25 + Math.floor(i / 5) * 30);
            bunny.setRotation(Math.random() * 360);

            container.addChild(bunny);
        }

        return container;
    },

    createRenderTexture(container) {
        const renderManager = this.app.renderManager;
        const renderTexture = new RenderTexture(Math.ceil(container.width), Math.ceil(container.height));

        renderManager.setRenderTarget(renderTexture);

        renderManager.clear();
        container.render(renderManager);

        renderManager.setRenderTarget(null);

        return renderTexture;
    },

    draw(renderManager) {
        renderManager.clear();
        this._container.render(renderManager);
        this._renderSprite.render(renderManager);
    },
}));
