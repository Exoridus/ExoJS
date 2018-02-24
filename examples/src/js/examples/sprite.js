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
         * @member {Sprite}
         */
        this._bunny = new Exo.Sprite(this._texture);
        this._bunny.setPosition(app.screen.width / 2 | 0, app.screen.height / 2 | 0);
        this._bunny.setAnchor(0.5);
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        this._bunny.rotate(delta.seconds * 360);
    },

    /**
     * @param {RenderManager} renderManager
     */
    draw(renderManager) {
        renderManager
            .clear()
            .draw(this._bunny)
            .display();
    },
}));
