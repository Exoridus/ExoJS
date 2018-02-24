const app = new Exo.Application({
    loader: new Exo.Loader({
        resourcePath: 'assets/'
    })
});

app.start(new Exo.Scene({

    /**
     * @param {Loader} loader
     */
    async load(loader) {

        /**
         * @private
         * @member {Video}
         */
        this._video = await loader.loadItem({
            type: 'video',
            name: 'example',
            path: 'video/example.webm',
        });
    },

    /**
     * @param {Application} app
     */
    init(app) {
        this._video.width = app.screen.width;
        this._video.height = app.screen.height;
        this._video.play({ loop: true, volume: 0.5 });

        this.app.inputManager.onPointerTap.add(() => {
            this._video.toggle();
        });
    },

    /**
     * @param {RenderManager} renderManager
     */
    draw(renderManager) {
        renderManager.clear()
            .draw(this._video)
            .display();
    },
}));
