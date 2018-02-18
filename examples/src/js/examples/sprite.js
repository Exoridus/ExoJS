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
        loader.add('texture', { bunny: 'image/bunny.png' });
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const screen = this.app.screen;

        console.log(this.app);
        console.log(this.app.screen);

        /**
         * @private
         * @member {Sprite}
         */
        this._bunny = new Exo.Sprite(resources.get('texture', 'bunny'));
        this._bunny.setPosition(screen.width / 2 | 0, screen.height / 2 | 0);
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
