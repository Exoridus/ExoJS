window.app = new Exo.Application({
    assetsPath: 'assets/',
    canvasParent: document.querySelector('.container-canvas'),
    width: 800,
    height: 600,
});

window.app.start(new Exo.Scene({

    /**
     * @param {ResourceLoader} loader
     */
    load(loader) {
        loader.addItem('texture', 'bunny', 'image/bunny.png');
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const canvas = this.app.canvas;

        /**
         * @type {Random}
         */
        this._random = new Exo.Random();

        /**
         * @type {Timer}
         */
        this._timer = new Exo.Timer(true, 500, Exo.TIME.MILLISECONDS);

        /**
         * @type {Container}
         */
        this._bunnies = new Exo.Container();
        this._bunnies.setPosition(canvas.width / 2 | 0, canvas.height / 2 | 0);

        for (let i = 0; i < 25; i++) {
            const bunny = new Exo.Sprite(resources.get('texture', 'bunny'));

            bunny.setPosition((i % 5) * (bunny.width + 10), (i / 5 | 0) * (bunny.height + 10));
            bunny.setTint(new Exo.Color(
                this._random.next(50, 255),
                this._random.next(50, 255),
                this._random.next(50, 255)
            ));

            this._bunnies.addChild(bunny);
        }

        this._bunnies.setOrigin(0.5);
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        if (this._timer.isExpired) {
            for (const bunny of this._bunnies.children) {
                bunny.setTint(new Exo.Color(
                    this._random.next(50, 255),
                    this._random.next(50, 255),
                    this._random.next(50, 255)
                ));
            }

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

    /**
     * @override
     */
    destroy() {
        for (const bunny of this._bunnies.children) {
            bunny.destroy();
        }

        this._random.destroy();
        this._random = null;

        this._timer.destroy();
        this._timer = null;

        this._bunnies.destroy();
        this._bunnies = null;
    },
}));
