window.app.start(new Exo.Scene({

    /**
     * @param {ResourceLoader} loader
     */
    load(loader) {
        loader.add('video', { example: 'video/example.webm' });
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const { width, height } = this.app.canvas;

        /**
         * @private
         * @member {Video}
         */
        this._video = resources.get('video', 'example');
        this._video.width = width;
        this._video.height = height;
        this._video.volume = 0.5;
        this._video.loop = true;
        this._video.play();

        this.app.on('pointer:down', () => {
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

    /**
     * @override
     */
    destroy() {
        this.app.off('pointer:down');

        this._video.destroy();
        this._video = null;
    },
}));
