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
        loader
            .addList('texture', {
                background: 'image/uv.png',
                bunny: 'image/bunny.png',
            }, {
                scaleMode: Exo.SCALE_MODE.NEAREST
            })
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
         * @member {Number[]}
         */
        this._blendModes = [
            Exo.BLEND_MODE.NORMAL,
            Exo.BLEND_MODE.ADD,
            Exo.BLEND_MODE.SUBTRACT,
            Exo.BLEND_MODE.MULTIPLY,
            Exo.BLEND_MODE.SCREEN,
        ];

        /**
         * @private
         * @member {Number}
         */
        this._blendModeIndex = 0;

        /**
         * @private
         * @member {Sprite}
         */
        this._background = new Exo.Sprite(resources.get('texture', 'background'));
        this._background.setOrigin(0.5, 0.5);
        this._background.setPosition(canvas.width / 2, canvas.height / 2);

        /**
         * @type {Sprite}
         */
        this._bunny = new Exo.Sprite(resources.get('texture', 'bunny'));
        this._bunny.setOrigin(0.5, 0.5);
        this._bunny.setScale(5);
        this._bunny.setPosition(canvas.width / 2, canvas.height / 2);
        this._bunny.setBlendMode(this._blendModes[this._blendModeIndex]);

        this.app.on('pointer:move', (pointer) => {
            this._bunny.setPosition(pointer.x, pointer.y);
        });

        this.app.on('pointer:down', () => {
            this._blendModeIndex += 1;
            this._blendModeIndex %= this._blendModes.length;

            this._bunny.setBlendMode(this._blendModes[this._blendModeIndex]);
        });
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        this._bunny.rotate(delta.seconds * 100);

        this.app.displayManager
            .clear()
            .draw(this._background)
            .draw(this._bunny)
            .display();
    },

    /**
     * @override
     */
    destroy() {
        this._background.destroy();
        this._background = null;

        this._bunny.destroy();
        this._bunny = null;
    },
}));
