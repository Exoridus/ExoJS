window.app = new Exo.Application({
    basePath: 'assets/',
    canvasParent: '.container-canvas',
    width: 800,
    height: 600,
});

window.app.start(new Exo.Scene({

    /**
     * @param {ResourceLoader} loader
     */
    load(loader) {
        loader.addItem('texture', 'bunny', 'image/bunny.png')
            .load(() => this.app.trigger('scene:start'));
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const canvas = this.app.canvas,
            displayManager = this.app.displayManager;

        /**
         * @private
         * @member {Container}
         */
        this._bunnies = this.createBunnies(resources.get('texture', 'bunny'));

        /**
         * @private
         * @member {RenderTarget}
         */
        this._renderTarget = new Exo.RenderTarget(300, 300);

        /**
         * @private
         * @member {RenderTexture}
         */
        this._renderTexture = new Exo.Texture(this._renderTarget);

        /**
         * @private
         * @member {Sprite}
         */
        this._renderSprite = new Exo.Sprite(this._renderTexture);
        this._renderSprite.setOrigin(1, 1);
        this._renderSprite.setPosition(canvas.width, canvas.height);

        displayManager.setRenderTarget(this._renderTarget);
        displayManager.renderBatch(this._bunnies);
    },

    /**
     * @public
     * @param {Texture} texture
     * @returns {Exo.Container}
     */
    createBunnies(texture) {
        const bunnies = new Exo.Container();

        for (let i = 0; i < 25; i++) {
            const bunny = new Exo.Sprite(texture);

            bunny.setOrigin(0.5, 0.5);
            bunny.setRotation(Math.random() * 360);
            bunny.setPosition(
                20 + (i % 5) * bunny.width,
                20 + (i / 5 | 0) * bunny.height,
            );

            bunnies.addChild(bunny);
        }

        return bunnies;
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        this.app.displayManager.renderBatch([
            this._bunnies,
            this._renderSprite,
        ]);
    },

    /**
     * @override
     */
    destroy() {
        for (const bunny of this._bunnies.children) {
            bunny.destroy();
        }

        this._renderTexture.destroy();
        this._renderTexture = null;

        this._renderSprite.destroy();
        this._renderSprite = null;

        this._bunnies.destroy();
        this._bunnies = null;
    },
}));
