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
        loader.addItem('texture', 'bunny', 'image/bunny.png');
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const app = this.app,
            canvas = app.canvas;

        /**
         * @private
         * @member {Texture}
         */
        this._bunnyTexture = resources.get('texture', 'bunny');

        /**
         * @private
         * @member {Sprite[]}
         */
        this._bunnies = [];

        /**
         * @private
         * @member {Number}
         */
        this._startAmount = 10;

        /**
         * @private
         * @member {Number}
         */
        this._addAmount = 50;

        /**
         * @private
         * @member {Number}
         */
        this._maxX = canvas.width;

        /**
         * @private
         * @member {Number}
         */
        this._maxY = canvas.height;

        /**
         * @private
         * @member {Number}
         */
        this._addInput = new Exo.Input([
            Exo.KEYBOARD.Space,
            Exo.POINTER.MouseLeft,
            Exo.GAMEPAD.FaceBottom,
        ], {
            context: this,
            active() {
                this.createBunnies(this._addAmount);
            },
        });

        app.inputManager.add(this._addInput);

        this.createBunnies(this._startAmount);
    },

    createBunnies(amount) {
        for (let i = 0; i < amount; i++) {
            const bunny = new Exo.Sprite(this._bunnyTexture);

            bunny._speedX = Math.random() * 10;
            bunny._speedY = Math.random() * 10;

            this._bunnies.push(bunny);
        }
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        const displayManager = this.app.displayManager;

        displayManager.clear();

        for (const bunny of this._bunnies) {
            bunny._speedY += 0.75;
            bunny.move(bunny._speedX, bunny._speedY);

            if (bunny.x + bunny.width > this._maxX) {
                bunny._speedX *= -1;
                bunny.x = this._maxX - bunny.width;
            } else if (bunny.x < 0) {
                bunny._speedX *= -1;
                bunny.x = 0;
            }

            if (bunny.y + bunny.height > this._maxY) {
                bunny._speedY *= -0.85;
                bunny.y = this._maxY - bunny.height;

                if (Math.random() > 0.5) {
                    bunny._speedY -= Math.random() * 6;
                }
            } else if (bunny.y < 0) {
                bunny._speedY *= -1;
                bunny.y = 0;
            }

            displayManager.draw(bunny);
        }

        displayManager.display();
    },

    /**
     * @override
     */
    destroy() {
        this.app.inputManager.remove(this._addInput);

        for (const bunny of this._bunnies) {
            bunny.destroy();
        }

        this._bunnyTexture.destroy();
        this._bunnyTexture = null;

        this._bunnies.length = 0;
        this._bunnies = null;

        this._addInput.destroy();
        this._addInput = null;

        this._startAmount = null;
        this._addAmount = null;
        this._maxX = null;
        this._maxY = null;
    },
}));
