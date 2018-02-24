const app = new Exo.Application({
    loader: new Exo.Loader({
        basePath: 'assets/'
    })
});

app.start(new Exo.Scene({

    /**
     * @param {Loader} loader
     */
    async load(loader) {

        /**
         * @private
         * @member {Texture}
         */
        this._texture = await loader.load('texture', 'image/bunny.png');
    },

    /**
     * @param {Application} app
     */
    init(app) {

        /**
         * @private
         * @member {Drawable}
         */
        this._container = this.createBunnyContainer(this._texture);

        /**
         * @private
         * @member {RenderTexture}
         */
        this._renderTexture = this.createRenderTexture(this._container);

        /**
         * @private
         * @member {Sprite}
         */
        this._renderSprite = new Exo.Sprite(this._renderTexture);
        this._renderSprite.setPosition(app.screen.width, app.screen.height);
        this._renderSprite.setAnchor(1, 1);
    },

    /**
     * @param {Texture} texture
     * @returns {Drawable}
     */
    createBunnyContainer(texture) {
        const container = new Exo.Drawable();

        for (let i = 0; i < 25; i++) {
            const bunny = new Exo.Sprite(texture);

            bunny.setAnchor(0.5, 0.5);
            bunny.setPosition(25 + (i % 5) * 30, 25 + Math.floor(i / 5) * 30);
            bunny.setRotation(Math.random() * 360);

            container.addChild(bunny);
        }

        return container;
    },

    /**
     * @param {Drawable} container
     * @returns {RenderTexture}
     */
    createRenderTexture(container) {
        const renderManager = this.app.renderManager,
            renderTexture = new Exo.RenderTexture(Math.ceil(container.width), Math.ceil(container.height));

        renderManager.setRenderTarget(renderTexture);

        renderManager.clear();
        renderManager.draw(container);
        renderManager.display();

        renderManager.setRenderTarget(null);

        return renderTexture;
    },

    /**
     * @param {RenderManager} renderManager
     */
    draw(renderManager) {
        renderManager
            .clear()
            .draw(this._container)
            .draw(this._renderSprite)
            .display();
    },
}));
