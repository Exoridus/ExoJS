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

        /**
         * @type {Texture}
         */
        this._bunnyTexture = resources.get('texture', 'bunny');

        /**
         * @type {Container}
         */
        this._bunnies = new Exo.Container();

        for (let i = 0; i < 25; i++) {
            const bunny = new Exo.Sprite(this._bunnyTexture);

            bunny.setPosition(
                (i % 5) * (bunny.width + 10),
                (i / 5 | 0) * (bunny.height + 10)
            );

            this._bunnies.addChild(bunny);
        }

        this._bunnies.setPosition(screen.width / 2 | 0, screen.height / 2 | 0);
        this._bunnies.setAnchor(0.5, 0.5);

        /**
         * @type {Timer}
         */
        this._timer = new Exo.Timer({ limit: 500, autoStart: true });

        /**
         * @type {Random}
         */
        this._random = new Exo.Random();

        this.tintBunnies();
    },

    /**
     * @public
     */
    tintBunnies() {
        for (const bunny of this._bunnies.children) {
            bunny.tint.set(
                this._random.next(50, 255),
                this._random.next(50, 255),
                this._random.next(50, 255)
            );
        }
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        if (this._timer.expired) {
            this.tintBunnies();
            this._timer.restart();
        }
    },

    /**
     * @param {RenderManager} renderManager
     */
    draw(renderManager) {
        renderManager
            .clear()
            .draw(this._bunnies)
            .display();
    },
}));
