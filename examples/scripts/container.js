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
        loader.addList('texture', {
                bunny: 'image/bunny.png',
                rainbow: 'image/rainbow.png',
            })
            .load(() => this.app.trigger('scene:start'));
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const app = this.app,
            canvas = app.canvas;

        /**
         * @type {Texture}
         */
        this._bunnyTexture = resources.get('texture', 'bunny');

        /**
         * @type {Texture}
         */
        this._rainbowTexture = resources.get('texture', 'rainbow');

        /**
         * @type {Sprite}
         */
        this._rainbow = new Exo.Sprite(this._rainbowTexture);

        /**
         * @type {Container}
         */
        this._bunnies = new Exo.Container();
        this._bunnies.setPosition(canvas.width / 2 | 0, canvas.height / 2 | 0);

        for (let i = 0; i < 25; i++) {
            const bunny = new Exo.Sprite(this._bunnyTexture);

            bunny.setPosition((i % 5) * (bunny.width + 10), (i / 5 | 0) * (bunny.height + 10));

            this._bunnies.addChild(bunny);
        }

        this._bunnies.setOrigin(0.5);
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        const displayManager = this.app.displayManager,
            bounds = this._bunnies.getBounds();

        this._rainbow.x = bounds.x;
        this._rainbow.y = bounds.y;
        this._rainbow.width = bounds.width;
        this._rainbow.height = bounds.height;

        this._bunnies.rotate(delta.seconds * 36);

        displayManager.begin();
        displayManager.render(this._rainbow);
        displayManager.render(this._bunnies);
        displayManager.end();

    },
}));
