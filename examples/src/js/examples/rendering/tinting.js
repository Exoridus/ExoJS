const app = new Exo.Application({
    resourcePath: 'assets/',
    canvasParent: document.body,
    width: 800,
    height: 600,
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
        const canvas = this.app.canvas;

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

        this._bunnies.setPosition(canvas.width / 2 | 0, canvas.height / 2 | 0);
        this._bunnies.setAnchor(0.5, 0.5);

        /**
         * @type {Timer}
         */
        this._timer = new Exo.Timer(true, 500, Exo.TIME.MILLISECONDS);

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
