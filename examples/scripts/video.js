window.app = new Exo.Application({
    basePath: 'assets/',
    canvasParent: '.container-canvas',
    width: 800,
    height: 600,
});

window.app.start(new Exo.Scene({

    load(loader) {
        loader.addItem('video', 'example', 'video/example.webm')
            .load()
            .then(() => this.app.trigger('scene:start'));
    },

    init() {
        const app = this.app;

        /**
         * @private
         * @member {HTMLVideoElement}
         */
        this._videoElement = app.loader.resources.get('video', 'example');

        /**
         * @private
         * @member {Video}
         */
        this._video = new Exo.Video(this._videoElement);
        this._video.size.set(800, 600);

        /**
         * @private
         * @member {Input}
         */
        this._input = new Exo.Input([
            Exo.Keyboard.Space,
        ], {
            context: this,
            trigger() {
                this._video.toggle();
            },
        });

        app.trigger('input:add', this._input)
            .trigger('media:play', this._video, { loop: true });
    },

    update() {
        this.app
            .trigger('display:begin')
            .trigger('display:render', this._video)
            .trigger('display:end');
    },
}));
