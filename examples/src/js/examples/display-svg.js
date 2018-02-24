const app = new Exo.Application({
    loader: new Exo.Loader({
        resourcePath: 'assets/'
    })
});

app.start(new Exo.Scene({

    /**
     * @param {Loader} loader
     */
    async load(loader) {

        /**
         * @private
         * @member {Image}
         */
        this._svg = await loader.loadItem({
            type: 'svg',
            name: 'tiger',
            path: 'svg/tiger.svg',
        });
    },

    /**
     * @param {Application} app
     */
    init(app) {

        /**
         * @private
         * @member {Texture}
         */
        this._texture = new Exo.Texture(this._svg);

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
