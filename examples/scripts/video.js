window.app = new Exo.Application({
    basePath: 'assets/',
    canvasParent: '.container-canvas',
    width: 800,
    height: 600,
});

window.app.start(new Exo.Scene({

    /**
     * @param {ResourceLoader} loader
     */
    load(loader) {
        loader.addItem('video', 'example', 'video/example.webm')
            .load(() => this.app.trigger('scene:start'));
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const app = this.app,
            canvas = app.canvas;

        /**
         * @private
         * @member {Video}
         */
        this._video = new Exo.Video(resources.get('video', 'example'));
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

        app.inputManager.add(this._input);
        app.mediaManager.play(this._video, { loop: true });
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        this.app.displayManager
            .begin()
            .render(this._video)
            .end();
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
