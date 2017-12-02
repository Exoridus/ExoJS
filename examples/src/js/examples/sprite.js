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
    },

    /**
     * @param {RenderManager} renderManager
     */
    draw(renderManager) {
        renderManager
            .clear()
            .draw(this._bunny)
            .display();
    },

    /**
     * @override
     */
    destroy() {
        this._bunny.destroy();
        this._bunny = null;
    },
}));
