const app = new Exo.Application({
    loader: new Exo.Loader({
        resourcePath: 'assets/'
    })
});

app.start(new Exo.Scene({

    /**
     * @param {Loader} loader
     */
    load(loader) {
        loader.add('svg', { tiger: 'svg/tiger.svg' });
    },

    /**
     * @param {ResourceCollection} resources
     */
    init(resources) {
        const screen = this.app.screen;

        /**
         * @private
         * @member {Texture}
         */
        this._texture = new Exo.Texture(resources.get('svg', 'tiger'));

        /**
         * @private
         * @member {Sprite}
         */
        this._tiger = new Exo.Sprite(this._texture);
        this._tiger.setAnchor(0.5);
        this._tiger.setPosition(screen.width / 2 | 0, screen.height / 2 | 0);
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
