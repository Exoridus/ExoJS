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
        this._texture = await loader.load('texture', 'image/bunny.png', { scaleMode: Exo.SCALE_MODES.NEAREST });
    },

    /**
     * @param {Application} app
     */
    init(app) {

        /**
         * @private
         * @member {Sprite}
         */
        this._bunny = new Exo.Sprite(this._texture);
        this._bunny.setPosition(app.screen.width / 2, app.screen.height / 2);
        this._bunny.setAnchor(0.5);
        this._bunny.setScale(3);
        this._bunny.addFilter(new Exo.Filter());
    },

    /**
     * @param {RenderManager} renderManager
     */
    draw(renderManager) {
        renderManager.clear()
            .draw(this._bunny)
            .display();
    },
}));
