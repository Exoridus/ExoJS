window.app = new Exo.Application({
    basePath: 'assets/',
    canvasParent: '.container-canvas',
    width: 800,
    height: 600,
});

window.app.start(new Exo.Scene({

    load(loader) {
        loader.addItem('texture', 'bunny', 'image/bunny.png')
            .load(() => this.app.trigger('scene:start'));
    },

    init() {
        const resources = this.app.loader.resources,
            canvas = this.app.canvas;

        this.bunny = new Exo.Sprite(resources.get('texture', 'bunny'));
        this.bunny.setOrigin(0.5);
        this.bunny.setPosition(canvas.width / 2 | 0, canvas.height / 2 | 0);

        this.addNode(this.bunny);
    },

    update(delta) {
        this.bunny.rotate(delta.seconds * 360);
    },
}));
