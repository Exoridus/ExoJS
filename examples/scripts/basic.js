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
            resources = app.loader.resources;

        this.bunny = new Exo.Sprite(resources.get('texture', 'bunny'));
        this.bunny.setOrigin(0.5, 0.5);
        this.bunny.setPosition(app.canvas.width / 2 | 0, app.canvas.height / 2 | 0);
    },

    update(delta) {
        this.bunny.rotate(delta.seconds * 360);

        this.app
            .trigger('display:begin')
            .trigger('display:render', this.bunny)
            .trigger('display:end');
    },
}));
