window.game = new Exo.Game({
    basePath: 'assets/',
    canvasParent: '.container-canvas',
    width: 800,
    height: 600,
});

window.game.start(new Exo.Scene({

    load(loader) {
        loader.addItem('video', 'example', 'video/example.webm')
            .load()
            .then(() => this.game.trigger('scene:start'));
    },

    init() {
        const game = this.game;

        /**
         * @private
         * @member {HTMLVideoElement}
         */
        this._videoElement = game.loader.resources.get('video', 'example');

        /**
         * @private
         * @member {Exo.Video}
         */
        this._video = new Exo.Video(this._videoElement);
        this._video.size.set(800, 600);

        /**
         * @private
         * @member {Exo.Input}
         */
        this._input = new Exo.Input([
            Exo.Keyboard.Space,
        ], {
            context: this,
            trigger() {
                this._video.toggle();
            },
        });

        game.trigger('input:add', this._input)
            .trigger('media:play', this._video, { loop: true });
    },

    update() {
        this.game
            .trigger('display:begin')
            .trigger('display:render', this._video)
            .trigger('display:end');
    },
}));
