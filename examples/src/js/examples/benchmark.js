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
        loader.add('texture', { bunny: 'image/bunny.png' });
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const screen = this.app.screen;

        /**
         * @private
         * @member {Texture}
         */
        this._bunnyTexture = resources.get('texture', 'bunny');

        /**
         * @private
         * @member {Drawable}
         */
        this._bunnies = new Exo.Drawable();

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
        this._maxX = screen.width;

        /**
         * @private
         * @member {Number}
         */
        this._maxY = screen.height;

        /**
         * @private
         * @member {Number}
         */
        this._addBunnies = false;

        /**
         * @private
         * @member {Stats}
         */
        this._stats = this.createStats();

        this.app.inputManager.onPointerDown.add(() => {
            this._addBunnies = true;
        });

        this.app.inputManager.onPointerUp.add(() => {
            this._addBunnies = false;
        });

        this.createBunnies(this._startAmount);
    },

    /**
     * @param {Number} amount
     */
    createBunnies(amount) {
        for (let i = 0; i < amount; i++) {
            const bunny = new Exo.Sprite(this._bunnyTexture);

            bunny._speedX = Math.random() * 10;
            bunny._speedY = Math.random() * 10;

            this._bunnies.addChild(bunny);
        }
    },

    /**
     * @returns {Stats}
     */
    createStats() {
        const stats = new Stats();

        stats.dom.style.position = 'absolute';
        stats.dom.style.top = '0';
        stats.dom.style.left = '0';

        document.body.appendChild(stats.dom);

        return stats;
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        this._stats.begin();

        if (this._addBunnies) {
            this.createBunnies(this._addAmount);
        }

        for (const bunny of this._bunnies.children) {
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
        }
    },

    /**
     * @param {RenderManager} renderManager
     */
    draw(renderManager) {
        renderManager.clear()
            .draw(this._bunnies)
            .display();

        this._stats.end();
    },
}));
