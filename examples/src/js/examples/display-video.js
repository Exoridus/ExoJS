const app = new Exo.Application({
    loader: new Exo.Loader({
        resourcePath: 'assets/'
    })
});

app.start(new Exo.Scene({

    /**
     * @param {Loader} loader
     */
    load(loader) {
        loader.add('video', { example: 'video/example.webm' });
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const screen = this.app.screen;

        /**
         * @private
         * @member {Video}
         */
        this._video = resources.get('video', 'example');
        this._video.width = screen.width;
        this._video.height = screen.height;
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
