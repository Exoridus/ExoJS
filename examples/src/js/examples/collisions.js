window.app = new Exo.Application({
    assetsPath: 'assets/',
    canvasParent: '.container-canvas',
    width: 800,
    height: 600,
});

window.app.start(new Exo.Scene({

    /**
     * @param {ResourceLoader} loader
     */
    load(loader) {
        loader.addItem('texture', 'bunny', 'image/bunny.png', {
            scaleMode: Exo.SCALE_MODE.NEAREST,
        });
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const canvas = this.app.canvas;

        /**
         * @type {Sprite}
         */
        this._leftBunny = new Exo.Sprite(resources.get('texture', 'bunny'));
        this._leftBunny.setPosition((canvas.width / 2) - 80, canvas.height / 2);
        this._leftBunny.setOrigin(0.5, 0.5);
        this._leftBunny.setScale(5, 5);

        /**
         * @type {Sprite}
         */
        this._rightBunny = new Exo.Sprite(resources.get('texture', 'bunny'));
        this._rightBunny.setPosition((canvas.width / 2) + 80, canvas.height / 2);
        this._rightBunny.setOrigin(0.5, 0.5);
        this._rightBunny.setScale(5, 5);
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        this._leftBunny.rotate(delta.seconds * 36);
        this._rightBunny.rotate(delta.seconds * -36);

        if (Exo.Collision.checkRectangleRectangle(this._leftBunny.getBounds(), this._rightBunny.getBounds())) {
            this._leftBunny.setTint(Exo.Color.Red);
            this._rightBunny.setTint(Exo.Color.Red);
        } else {
            this._leftBunny.setTint(Exo.Color.White);
            this._rightBunny.setTint(Exo.Color.White);
        }

        this.app.renderManager
            .clear()
            .draw(this._leftBunny)
            .draw(this._rightBunny)
            .display();
    },

    /**
     * @override
     */
    destroy() {
        this._leftBunny.destroy();
        this._leftBunny = null;

        this._rightBunny.destroy();
        this._rightBunny = null;
    },
}));
