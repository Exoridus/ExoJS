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
        loader.addItem('texture', 'bunny', 'image/bunny.png')
            .load(() => this.app.trigger('scene:start'));
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const canvas = this.app.canvas;

        /**
         * @private
         * @member {Sprite}
         */
        this._bunny = new Exo.Sprite(resources.get('texture', 'bunny'));
        this._bunny.setOrigin(0.5);
        this._bunny.setPosition(canvas.width / 2 | 0, canvas.height / 2 | 0);
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        this._bunny.rotate(delta.seconds * 360);

        this.app.displayManager
            .begin()
            .draw(this._bunny)
            .end();
    },

    /**
     * @override
     */
    destroy() {
        this._bunny.destroy();
        this._bunny = null;
    },
}));
