const app = new Exo.Application({
    loader: new Exo.Loader({
        resourcePath: 'assets/'
    })
});

app.start(new Exo.Scene({

    /**
     * @param {Loader} loader
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
     * @param {ResourceCollection} resources
     */
    init(resources) {
        const screen = this.app.screen;

        /**
         * @private
         * @member {Sprite}
         */
        this._background = new Exo.Sprite(resources.get('texture', 'background'));
        this._background.setPosition(screen.width / 2, screen.height / 2);
        this._background.setAnchor(0.5, 0.5);

        /**
         * @type {Sprite}
         */
        this._leftBunny = new Exo.Sprite(resources.get('texture', 'bunny'));
        this._leftBunny.setAnchor(0.5, 0.5);
        this._leftBunny.setScale(5);

        /**
         * @type {Sprite}
         */
        this._rightBunny = new Exo.Sprite(resources.get('texture', 'bunny'));
        this._rightBunny.setAnchor(0.5, 0.5);
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

        this._info.setPosition(screen.width / 2, 0);
        this._info.setAnchor(0.5, 0);

        this.app.inputManager.onPointerDown.add(this.updateBlendMode, this);

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
        const screen = this.app.screen,
            offset = (Math.cos(this._ticker * 3) * 0.5 + 0.5) * (screen.width * 0.25);

        this._leftBunny.setPosition((screen.width / 2) - offset, screen.height / 2);
        this._rightBunny.setPosition((screen.width / 2) + offset, screen.height / 2);

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
}));
