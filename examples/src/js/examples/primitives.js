window.app = new Exo.Application({
    assetsPath: 'assets/',
    canvasParent: document.querySelector('.container-canvas'),
    width: 800,
    height: 600,
});

window.app.start(new Exo.Scene({

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {

        /**
         * @type {Drawable}
         */
        this._drawable = new Exo.Drawable();
    },

    /**
     * @param {RenderManager} renderManager
     */
    draw(renderManager) {
        renderManager
            .clear()
            .draw(this._drawable)
            .display();
    },

    /**
     * @override
     */
    destroy() {
        this._drawable.destroy();
        this._drawable = null;
    },
}));