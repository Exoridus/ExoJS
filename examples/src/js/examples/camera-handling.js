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
        loader.add('texture', { example: 'image/uv.png' });
    },

    /**
     * @param {ResourceCollection} resources
     */
    init(resources) {
        const { width, height } = this.app.screen;

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
         * @member {View}
         */
        this._camera = new Exo.View(0, 0, width, height);

        /**
         * @private
         * @member {Sprite}
         */
        this._sprite = new Exo.Sprite(resources.get('texture', 'example'));
        this._sprite.setAnchor(0.5, 0.5);

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

        this.app.inputManager.add([

            // Move Up
            new Exo.Input(Exo.KEYBOARD.W, {
                context: this,
                onActive(value) {
                    this._camera.move(0, value * -this._moveSpeed);
                },
            }),

            // Move Down
            new Exo.Input(Exo.KEYBOARD.S, {
                context: this,
                onActive(value) {
                    this._camera.move(0, value * this._moveSpeed);
                },
            }),

            // Move Left
            new Exo.Input(Exo.KEYBOARD.A, {
                context: this,
                onActive(value) {
                    this._camera.move(value * -this._moveSpeed, 0);
                },
            }),

            // Move Right
            new Exo.Input(Exo.KEYBOARD.D, {
                context: this,
                onActive(value) {
                    this._camera.move(value * this._moveSpeed, 0);
                },
            }),

            // Zoom In
            new Exo.Input(Exo.KEYBOARD.Up, {
                context: this,
                onActive(value) {
                    this._camera.zoom(1 + (value * -this._zoomSpeed));
                },
            }),

            // Zoom Out
            new Exo.Input(Exo.KEYBOARD.Down, {
                context: this,
                onActive(value) {
                    this._camera.zoom(1 + (value * this._zoomSpeed));
                },
            }),

            // Rotate Left
            new Exo.Input(Exo.KEYBOARD.Left, {
                context: this,
                onActive(value) {
                    this._camera.rotate(value * -this._rotationSpeed);
                },
            }),

            // Rotate Right
            new Exo.Input(Exo.KEYBOARD.Right, {
                context: this,
                onActive(value) {
                    this._camera.rotate(value * this._rotationSpeed);
                },
            }),

            // Reset
            new Exo.Input(Exo.KEYBOARD.R, {
                context: this,
                onTrigger(value) {
                    this._camera.reset(0, 0, width, height);
                },
            })
        ]);
    },

    /**
     * @param {RenderManager} renderManager
     */
    draw(renderManager) {
        renderManager.clear();

        renderManager.renderTarget.setView(this._camera);
        renderManager.draw(this._sprite).display();

        renderManager.renderTarget.setView(null);
        renderManager.draw(this._info).display();
    },
}));
