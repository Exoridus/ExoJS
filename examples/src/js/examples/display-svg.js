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
        this._texture = new Exo.Texture(await loader.load('svg', 'svg/tiger.svg'));
    },

    /**
     * @param {Application} app
     */
    init(app) {

        /**
         * @private
         * @member {Sprite}
         */
        this._tiger = new Exo.Sprite(this._texture);
        this._tiger.setAnchor(0.5);
        this._tiger.setPosition(app.screen.width / 2 | 0, app.screen.height / 2 | 0);
    },

    /**
     * @param {RenderManager} renderManager
     */
    draw(renderManager) {
        renderManager
            .clear()
            .draw(this._tiger)
            .display();
    },
}));
