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
        const canvas = this.app.canvas;

        /**
         * @private
         * @member {Video}
         */
        this._video = resources.get('video', 'example');
        this._video.width = canvas.width;
        this._video.height = canvas.height;
        this._video.play({ loop: true, volume: 0.5 });

        this.app.on('pointer:down', () => {
            this._video.toggle();
        });

        this.app.on('resize', (width, height) => {
            this._video.width = width;
            this._video.height = height;
        })
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
        this.app.off('resize');

        this._video.destroy();
        this._video = null;
    },
}));
