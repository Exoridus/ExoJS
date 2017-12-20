const app = new Exo.Application({
    resourcePath: 'assets/',
    canvasParent: document.body,
    width: 800,
    height: 600,
});

app.start(new Exo.Scene({

    /**
     * @param {Loader} loader
     */
    load(loader) {
        loader.add('texture', { explosion: 'image/explosion.png' });
        loader.add('json', { explosion: 'json/explosion.json' });
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const { width, height } = this.app.canvas,
            texture = resources.get('texture', 'explosion'),
            data = resources.get('json', 'explosion');

        /**
         * @type {Spritesheet}
         */
        this._spritesheet = new Exo.Spritesheet(texture, data);

        /**
         * @type {Sprite}
         */
        this._sprite = this._spritesheet.sprites['explosion-0'];

        /**
         * @type {Timer}
         */
        this._timer = new Exo.Timer(true, 10);

        /**
         * @type {Number}
         */
        this._frame = 0;

        /**
         * @type {Number}
         */
        this._frames = 64;

        for (const sprite of Object.values(this._spritesheet.sprites)) {
            sprite.setOrigin(0.5);
            sprite.setPosition(width / 2, height / 2);
        }
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        if (this._timer.expired) {
            this._frame = (this._frame + 1) % this._frames;
            this._sprite = this._spritesheet.sprites[`explosion-${this._frame}`];
            this._timer.restart();
        }
    },

    /**
     * @param {RenderManager} renderManager
     */
    draw(renderManager) {
        renderManager
            .clear()
            .draw(this._sprite)
            .display();
    },
}));
