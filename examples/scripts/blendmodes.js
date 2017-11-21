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
                scaleMode: Exo.SCALE_MODE.NEAREST,
            });
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const canvas = this.app.canvas;

        /**
         * @private
         * @member {Sprite}
         */
        this._background = new Exo.Sprite(resources.get('texture', 'background'));
        this._background.setPosition(canvas.width / 2, canvas.height / 2);
        this._background.setOrigin(0.5, 0.5);

        /**
         * @type {Sprite}
         */
        this._leftBunny = new Exo.Sprite(resources.get('texture', 'bunny'));
        this._leftBunny.setOrigin(0.5, 0.5);
        this._leftBunny.setScale(5);

        /**
         * @type {Sprite}
         */
        this._rightBunny = new Exo.Sprite(resources.get('texture', 'bunny'));
        this._rightBunny.setOrigin(0.5, 0.5);
        this._rightBunny.setScale(5);

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
         * @type {Number}
         */
        this._ticker = 0;

        this.app.on('pointer:down', this.updateBlendMode, this);

        this.updateBlendMode();
    },

    /**
     * @private
     */
    updateBlendMode() {
        const blendModes = this._blendModes;

        this._leftBunny.setBlendMode(blendModes[(blendModes.indexOf(this._leftBunny.blendMode) + 1) % blendModes.length]);
        this._rightBunny.setBlendMode(blendModes[(blendModes.indexOf(this._rightBunny.blendMode) + 1) % blendModes.length]);
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        const canvas = this.app.canvas,
            offset = (Math.cos(this._ticker * 3) * 0.5 + 0.5) * (canvas.width * 0.25);

        this._leftBunny.setPosition((canvas.width / 2) - offset, canvas.height / 2);
        this._rightBunny.setPosition((canvas.width / 2) + offset, canvas.height / 2);

        this._ticker += delta.seconds;

        this.app.displayManager
            .clear()
            .draw(this._background)
            .draw(this._leftBunny)
            .draw(this._rightBunny)
            .display();
    },

    /**
     * @override
     */
    destroy() {
        this._background.destroy();
        this._background = null;

        this._leftBunny.destroy();
        this._leftBunny = null;

        this._rightBunny.destroy();
        this._rightBunny = null;

        this._blendModes.length = 0;
        this._blendModes = null;

        this._ticker = null;
    },
}));
