const app = new Exo.Application({
    resourcePath: 'assets/',
    clearColor: Exo.Color.Black,
    canvasParent: document.body,
    width: 800,
    height: 600,
});

app.start(new Exo.Scene({

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
