window.app = new Exo.Application({
    basePath: 'assets/',
    canvasParent: '.container-canvas',
    width: 800,
    height: 600,
});

window.app.start(new Exo.Scene({

    load(loader) {
        loader.addList('texture', {
                bunny: 'image/bunny.png',
                rainbow: 'image/rainbow.png',
            })
            .load()
            .then(() => this.app.trigger('scene:start'));
    },

    init() {
        const app = this.app,
            resources = app.loader.resources,
            canvas = app.canvas;

        /**
         * @type {Texture}
         */
        this.bunnyTexture = resources.get('texture', 'bunny');

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
            const bunny = new Exo.Sprite(this.bunnyTexture);

            bunny.setPosition((i % 5) * (bunny.width + 10), (i / 5 | 0) * (bunny.height + 10));

            this.bunnies.addChild(bunny);
        }

        this.bunnies.setOrigin(0.5);

        this.addNode(this.rainbow)
            .addNode(this.bunnies);
    },

    update(delta) {
        const bunnies = this.bunnies,
            rainbow = this.rainbow,
            bounds = bunnies.getBounds();

        bunnies.rotate(delta.seconds * 36);

        rainbow.setPosition(bounds.x, bounds.y);
        rainbow.width = bounds.width;
        rainbow.height = bounds.height;
    },
}));