const app = new Exo.Application({
    loader: new Exo.Loader({
        basePath: 'assets/'
    })
});

app.start(new Exo.Scene({

    /**
     * @param {Application} app
     */
    init(app) {

        /**
         * @private
         * @member {Graphics}
         */
        this._graphics = new Exo.Graphics({
            lineWidth: 5,
            lineColor: Exo.Color.Yellow,
            fillColor: Exo.Color.Red,
        });

        this._graphics.drawRectangle(20, 10, 100, 50);
    },

    /**
     * @param {RenderManager} renderManager
     */
    draw(renderManager) {
        renderManager.clear()
            .draw(this._graphics)
            .display();
    },
}));
