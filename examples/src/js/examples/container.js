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
        loader.add('texture', {
            bunny: 'image/bunny.png',
            rainbow: 'image/rainbow.png',
        });
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const canvas = this.app.canvas;

        /**
         * @type {Sprite}
         */
        this._rainbow = new Exo.Sprite(resources.get('texture', 'rainbow'));

        /**
         * @type {Container}
         */
        this._bunnies = new Exo.Container();
        this._bunnies.setPosition(canvas.width / 2 | 0, canvas.height / 2 | 0);

        for (let i = 0; i < 25; i++) {
            const bunny = new Exo.Sprite(resources.get('texture', 'bunny'));

            bunny.setPosition((i % 5) * (bunny.width + 15), (i / 5 | 0) * (bunny.height + 10));

            this._bunnies.addChild(bunny);
        }

        this._bunnies.setOrigin(0.5);
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
