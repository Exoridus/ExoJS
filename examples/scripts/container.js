window.app = new Exo.Application({
    basePath: 'assets/',
    canvasParent: '.container-canvas',
    width: 800,
    height: 600,
});

window.app.start(new Exo.Scene({

    load(loader) {
        loader.addItem('texture', 'bunny', 'image/bunny.png')
            .load()
            .then(() => this.app.trigger('scene:start'));
    },

    init() {
        const app = this.app,
            resources = app.loader.resources,
            canvas = app.canvas;

        this.bunnyTexture = resources.get('texture', 'bunny');

        this.bunnies = new Exo.Container();
        this.bunnies.setPosition(canvas.width / 2 | 0, canvas.height / 2 | 0);

        for (let i = 0; i < 25; i++) {
            const bunny = new Exo.Sprite(this.bunnyTexture);

            bunny.setPosition((i % 5) * bunny.width, (i / 5 | 0) * bunny.height);

            this.bunnies.addChild(bunny);
        }

        this.bunnies.setOrigin(0.5, 0.5);
    },

    update(delta) {
        this.bunnies.rotate(delta.seconds * 360);

        this.app
            .trigger('display:begin')
            .trigger('display:render', this.bunnies)
            .trigger('display:end');
    },
}));
