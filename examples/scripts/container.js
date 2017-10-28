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
        this.rainbowTexture = resources.get('texture', 'rainbow');

        /**
         * @type {Sprite}
         */
        this.rainbow = new Exo.Sprite(this.rainbowTexture);

        /**
         * @type {Container}
         */
        this.bunnies = new Exo.Container();
        this.bunnies.setPosition(canvas.width / 2 | 0, canvas.height / 2 | 0);

        for (let i = 0; i < 25; i++) {
            const bunny = new Exo.Sprite(this._bunnyTexture);

            bunny.setPosition((i % 5) * (bunny.width + 10), (i / 5 | 0) * (bunny.height + 10));

            this.bunnies.addChild(bunny);
        }

        this.bunnies.setOrigin(0.5);

        this.addNode(this.rainbow)
            .addNode(this.bunnies);
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        const bounds = this.bunnies.getBounds();

        this.bunnies.rotate(delta.seconds * 36);

        this.rainbow.x = bounds.x;
        this.rainbow.y = bounds.y;
        this.rainbow.width = bounds.width;
        this.rainbow.height = bounds.height;
    },
}));
