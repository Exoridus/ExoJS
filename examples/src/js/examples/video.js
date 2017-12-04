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
        loader.addItem('video', 'example', 'video/example.webm');
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

        this._video.play({ loop: true });

        this.app.on('pointer:down', () => {
            this._video.toggle();
        });
    },

    /**
     * @param {RenderManager} renderManager
     */
    draw(renderManager) {
        renderManager
            .clear()
            .draw(this._video)
            .display();
    },

    /**
     * @override
     */
    destroy() {
        this._video.destroy();
        this._video = null;
    },
}));
