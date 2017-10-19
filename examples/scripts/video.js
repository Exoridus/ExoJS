window.app = new Exo.Application({
    basePath: 'assets/',
    canvasParent: '.container-canvas',
    width: 800,
    height: 600,
});

window.app.start(new Exo.Scene({

    load(loader) {
        loader.addItem('video', 'example', 'video/example.webm')
            .load(() => this.app.trigger('scene:start'));
    },

    init() {
        /**
         * @private
         * @member {HTMLVideoElement}
         */
        this.videoElement = this.app.loader.resources.get('video', 'example');

        /**
         * @private
         * @member {Video}
         */
        this.video = new Exo.Video(this.videoElement);
        this.video.width = 800;
        this.video.height = 600;

        /**
         * @private
         * @member {Input}
         */
        this._input = new Exo.Input([
            Exo.KEYS.Space,
        ], {
            context: this,
            trigger() {
                this.video.toggle();
            },
        });

        this.app
            .trigger('input:add', this._input)
            .trigger('media:play', this.video, { loop: true });

        this.addNode(this.video);
    },
}));
