window.app.start(new Exo.Scene({

    /**
     * @param {ResourceLoader} loader
     */
    load(loader) {
        loader.add('texture', {
            background: 'image/uv.png',
            bunny: 'image/bunny.png',
        }, {
            scaleMode: Exo.SCALE_MODES.NEAREST,
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
            Exo.BLEND_MODES.NORMAL,
            Exo.BLEND_MODES.ADD,
            Exo.BLEND_MODES.SUBTRACT,
            Exo.BLEND_MODES.MULTIPLY,
            Exo.BLEND_MODES.SCREEN,
        ];

        /**
         * @private
         * @member {String[]}
         */
        this._blendModeNames = [
            'NORMAL',
            'ADD',
            'SUBTRACT',
            'MULTIPLY',
            'SCREEN',
        ];

        /**
         * @private
         * @member {Number}
         */
        this._blendModeIndex = 0;

        /**
         * @private
         * @type {Number}
         */
        this._ticker = 0;

        /**
         * @private
         * @member {Text}
         */
        this._info = new Exo.Text('Click to switch between blend modes', {
            fontSize: 16,
            padding: 10,
            fill: '#fff',
            align: 'center',
        });

        this._info.setPosition(canvas.width / 2, 0);
        this._info.setOrigin(0.5, 0);

        this.app.on('pointer:down', this.updateBlendMode, this);

        this.updateBlendMode();
    },

    /**
     * @private
     */
    updateBlendMode() {
        this._blendModeIndex = (this._blendModeIndex + 1) % this._blendModes.length;

        this._leftBunny.setBlendMode(this._blendModes[this._blendModeIndex]);
        this._rightBunny.setBlendMode(this._blendModes[this._blendModeIndex]);

        this._info.setText([
            `Click to switch between blend modes`,
            `Current blend mode: ${this._blendModeNames[this._blendModeIndex]}`,
        ].join('\n'));
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
    },

    /**
     * @param {RenderManager} renderManager
     */
    draw(renderManager) {
        renderManager
            .clear()
            .draw(this._background)
            .draw(this._leftBunny)
            .draw(this._rightBunny)
            .draw(this._info)
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

        this._info.destroy();
        this._info = null;

        this._blendModes.length = 0;
        this._blendModes = null;

        this._blendModeNames.length = 0;
        this._blendModeNames = null;

        this._blendModeIndex = null;
        this._ticker = null;
    },
}));
