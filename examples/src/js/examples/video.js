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

        /**
         * @private
         * @member {Input}
         */
        this._input = new Exo.Input([
            Exo.KEYBOARD.Space,
            Exo.GAMEPAD.FaceBottom,
        ], {
            context: this,
            trigger() {
                this._video.toggle();
            },
        });

        this.app.inputManager.add(this._input);

        this._video.play({ loop: true });
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
        this.app.inputManager.remove(this._input);

        this._video.destroy();
        this._video = null;

        this._input.destroy();
        this._input = null;
    },
}));
