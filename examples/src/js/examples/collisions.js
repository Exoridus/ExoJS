window.app = new Exo.Application({
    assetsPath: 'assets/',
    canvasParent: document.querySelector('.container-canvas'),
    width: 800,
    height: 600,
});

window.app.start(new Exo.Scene({

    /**
     * @param {ResourceLoader} loader
     */
    load(loader) {
        loader.addItem('texture', 'rainbow', 'image/rainbow.png');
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const canvas = this.app.canvas;

        /**
         * @type {Sprite}
         */
        this._rotating = new Exo.Sprite(resources.get('texture', 'rainbow'));
        this._rotating.setPosition((canvas.width / 2) - 120, canvas.height / 2);
        this._rotating.setOrigin(0.5, 0.5);

        /**
         * @type {Sprite}
         */
        this._pointer = new Exo.Sprite(resources.get('texture', 'rainbow'));
        this._pointer.setPosition((canvas.width / 2) + 120, canvas.height / 2);
        this._pointer.setOrigin(0.5, 0.5);

        /**
         * @type {Number}
         */
        this._ticker = 0;

        this.app.on('pointer:move', (pointer) => {
            this._pointer.setPosition(pointer.x, pointer.y);
        });
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        this._rotating.setRotation(this._ticker * 10);
        this._rotating.setScale(0.5 + (Math.sin(this._ticker) * 0.25 + 0.25));

        if (this._pointer.intersects(this._rotating)) {
            this._pointer.setTint(Exo.Color.Red);
            this._rotating.setTint(Exo.Color.Red);
        } else {
            this._pointer.setTint(Exo.Color.White);
            this._rotating.setTint(Exo.Color.White);
        }

        this._ticker += delta.seconds;
    },

    /**
     * @param {RenderManager} renderManager
     */
    draw(renderManager) {
        renderManager
            .clear()
            .draw(this._rotating)
            .draw(this._pointer)
            .display();
    },

    /**
     * @override
     */
    destroy() {
        this._rotating.destroy();
        this._rotating = null;

        this._pointer.destroy();
        this._pointer = null;
    },
}));
