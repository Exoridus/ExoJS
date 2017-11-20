window.app = new Exo.Application({
    basePath: 'assets/',
    canvasParent: '.container-canvas',
    width: 800,
    height: 600,
    clearBeforeRender: false,
});

window.app.start(new Exo.Scene({

    /**
     * @param {ResourceLoader} loader
     */
    load(loader) {
        loader.addItem('texture', 'example', 'image/uv.png')
            .load(() => this.app.trigger('scene:start'));
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const canvas = this.app.canvas;

        /**
         * @private
         * @member {Number}
         */
        this._moveSpeed = 3;

        /**
         * @private
         * @member {Number}
         */
        this._zoomSpeed = 0.01;

        /**
         * @private
         * @member {Number}
         */
        this._rotationSpeed = 1;

        /**
         * @private
         * @member {RenderTarget}
         */
        this._renderTarget = this.app.displayManager.renderTarget;

        /**
         * @private
         * @member {View}
         */
        this._camera = new Exo.View(0, 0, canvas.width, canvas.height);

        /**
         * @private
         * @member {Sprite}
         */
        this._sprite = new Exo.Sprite(resources.get('texture', 'example'));
        this._sprite.setOrigin(0.5, 0.5);
        this._sprite.setPosition(canvas.width / 2, canvas.height / 2);

        /**
         * @private
         * @member {Text}
         */
        this._info = new Exo.Text([
            'Camera:',
            'W/A/S/D = Move',
            'Up/Down = Zoom',
            'Left/Right = Rotate',
            'R = Reset',
        ].join('\n'), {
            fontSize: 16,
            fill: '#fff',
            padding: 10,
        });

        this.addInputs();
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        const displayManager = this.app.displayManager,
            renderTarget = displayManager.renderTarget;

        displayManager.clear();

        renderTarget.setView(this._camera);

        displayManager
            .draw(this._sprite)
            .display();

        renderTarget.setView(null);

        displayManager
            .draw(this._info)
            .display();
    },

    /**
     * @override
     */
    destroy() {
        this.app.inputManager.clear(true);

        this._renderTarget.setView(null);
        this._renderTarget = null;

        this._camera.destroy();
        this._camera = null;

        this._sprite.destroy();
        this._sprite = null;

        this._info.destroy();
        this._info = null;
    },

    /**
     * @private
     */
    addInputs() {

        this.app.inputManager.add([

            // Move Up
            new Exo.Input(Exo.KEYBOARD.W, {
                context: this,
                active(value) {
                    this._camera.move(0, value * -this._moveSpeed);
                },
            }),

            // Move Down
            new Exo.Input(Exo.KEYBOARD.S, {
                context: this,
                active(value) {
                    this._camera.move(0, value * this._moveSpeed);
                },
            }),

            // Move Left
            new Exo.Input(Exo.KEYBOARD.A, {
                context: this,
                active(value) {
                    this._camera.move(value * -this._moveSpeed, 0);
                },
            }),

            // Move Right
            new Exo.Input(Exo.KEYBOARD.D, {
                context: this,
                active(value) {
                    this._camera.move(value * this._moveSpeed, 0);
                },
            }),

            // Zoom In
            new Exo.Input(Exo.KEYBOARD.Up, {
                context: this,
                active(value) {
                    this._camera.zoom(1 + (value * -this._zoomSpeed));
                },
            }),

            // Zoom Out
            new Exo.Input(Exo.KEYBOARD.Down, {
                context: this,
                active(value) {
                    this._camera.zoom(1 + (value * this._zoomSpeed));
                },
            }),

            // Rotate Left
            new Exo.Input(Exo.KEYBOARD.Left, {
                context: this,
                active(value) {
                    this._camera.rotate(value * -this._rotationSpeed);
                },
            }),

            // Rotate Right
            new Exo.Input(Exo.KEYBOARD.Right, {
                context: this,
                active(value) {
                    this._camera.rotate(value * this._rotationSpeed);
                },
            }),

            // Reset
            new Exo.Input(Exo.KEYBOARD.R, {
                context: this,
                trigger(value) {
                    this._camera.reset(0, 0, this._renderTarget.width, this._renderTarget.height);
                },
            })
        ]);
    },
}));
