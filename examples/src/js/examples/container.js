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
        this._rainbowTexture = await loader.load('texture', 'image/rainbow.png');

        /**
         * @private
         * @member {Texture}
         */
        this._bunnyTexture = await loader.load('texture', 'image/bunny.png');
    },

    /**
     * @param {Application} app
     */
    init(app) {

        /**
         * @type {Sprite}
         */
        this._rainbow = new Exo.Sprite(this._rainbowTexture);

        /**
         * @type {Drawable}
         */
        this._bunnies = new Exo.Drawable();
        this._bunnies.setPosition(app.screen.width / 2 | 0, app.screen.height / 2 | 0);

        for (let i = 0; i < 25; i++) {
            const bunny = new Exo.Sprite(this._bunnyTexture);

            bunny.setPosition((i % 5) * (bunny.width + 15), (i / 5 | 0) * (bunny.height + 10));

            this._bunnies.addChild(bunny);
        }

        this._bunnies.setAnchor(0.5);
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        const bounds = this._bunnies.getBounds();

        this._rainbow.x = bounds.x;
        this._rainbow.y = bounds.y;
        this._rainbow.width = bounds.width;
        this._rainbow.height = bounds.height;

        this._bunnies.rotate(delta.seconds * 36);
    },

    /**
     * @param {RenderManager} renderManager
     */
    draw(renderManager) {
        renderManager
            .clear()
            .draw(this._rainbow)
            .draw(this._bunnies)
            .display();
    },
}));
