window.app = new Exo.Application({
    assetsPath: 'assets/',
    canvasParent: document.querySelector('.container-canvas'),
    width: 800,
    height: 600,
});

window.app.start(new Exo.Scene({

    /**
     * @param {ResourceLoader} loader
     */
    load(loader) {
        loader.addItem('texture', 'bunny', 'image/bunny.png');
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const canvas = this.app.canvas;

        /**
         * @private
         * @member {Container}
         */
        this._container = this.createBunnyContainer(resources.get('texture', 'bunny'));

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
        this._renderSprite.setPosition(canvas.width, canvas.height);
        this._renderSprite.setOrigin(1, 1);
    },

    /**
     * @param {Texture} texture
     * @returns {Container}
     */
    createBunnyContainer(texture) {
        const container = new Exo.Container();

        for (let i = 0; i < 25; i++) {
            const bunny = new Exo.Sprite(texture);

            bunny.setOrigin(0.5, 0.5);
            bunny.setPosition(25 + (i % 5) * 30, 25 + Math.floor(i / 5) * 30);
            bunny.setRotation(Math.random() * 360);

            container.addChild(bunny);
        }

        return container;
    },

    /**
     * @param {Container} container
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

    /**
     * @override
     */
    destroy() {
        this._container.destroy();
        this._container = null;

        this._renderTexture.destroy();
        this._renderTexture = null;

        this._renderSprite.destroy();
        this._renderSprite = null;
    },
}));
