const app = new Exo.Application({
    resourcePath: 'assets/',
    canvasParent: document.body,
    width: 800,
    height: 600,
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
        const canvas = this.app.canvas;

        /**
         * @private
         * @member {Video}
         */
        this._video = resources.get('video', 'example');
        this._video.width = canvas.width;
        this._video.height = canvas.height;
        this._video.play({ loop: true, volume: 0.5 });

        this.app.inputManager.on('pointer:down', () => {
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
