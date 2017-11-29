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
        loader.addItem('texture', 'explosion', 'image/explosion.png');
        loader.addItem('json', 'spritesheet', 'json/spritesheet.json');
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const canvas = this.app.canvas,
            texture = resources.get('texture', 'explosion'),
            frames = resources.get('json', 'spritesheet');

        /**
         * @type {Spritesheet}
         */
        this._spritesheet = new Exo.Spritesheet(texture, frames);
        this._spritesheet.setPosition(canvas.width / 2, canvas.height / 2);
        this._spritesheet.setOrigin(0.5, 0.5);

        /**
         * @type {Vector}
         */
        this._frameCount = new Exo.Vector(8, 8);

        /**
         * @type {Number}
         */
        this._ticker = 0;
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        const x = (this._ticker % this._frameCount.x),
            y = ((this._ticker / this._frameCount.x | 0) % this._frameCount.y);

        this._spritesheet.setFrame(`explosion ${x}-${y}`);

        this.app.renderManager
            .clear()
            .draw(this._spritesheet)
            .display();

        this._ticker++;
    },

    /**
     * @override
     */
    destroy() {
        this._spritesheet.destroy();
        this._spritesheet = null;

        this._frameCount.destroy();
        this._frameCount = null;

        this._ticker = null;
    },
}));
