window.game = new Exo.Game({
    basePath: 'assets/',
    canvasParent: '.container-canvas',
    width: 800,
    height: 600,
});

window.game.start(new Exo.Scene({

    load(loader) {
        loader.addItem('sprite', 'bunny', 'image/bunny.png')
            .load()
            .then(() => this.game.trigger('scene:start'));
    },

    init() {
        const game = this.game;

        this.bunny = game.loader.resources.get('sprite', 'bunny');
        this.bunny.setOrigin(0.5, 0.5);
        this.bunny.setPosition(game.canvas.width / 2 | 0, game.canvas.height / 2 | 0);
    },

    update(delta) {
        this.bunny.rotate(delta.asSeconds() * 360);

        this.game
            .trigger('display:begin')
            .trigger('display:render', this.bunny)
            .trigger('display:end');
    },
}));
