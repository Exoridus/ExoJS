const app = new Exo.Application({
    loader: new Exo.Loader({
        resourcePath: 'assets/'
    })
});

app.start(new Exo.Scene({

    /**
     * @param {Loader} loader
     */
    async load(loader) {

        /**
         * @private
         * @member {Texture}
         */
        this._texture = await loader.loadItem({
            type: 'texture',
            name: 'explosion',
            path: 'image/explosion.png',
        });

        /**
         * @private
         * @member {Object}
         */
        this._json = await loader.loadItem({
            type: 'json',
            name: 'explosion',
            path: 'json/explosion.json',
        });
    },

    /**
     * @param {Application} app
     */
    init(app) {

        /**
         * @type {Spritesheet}
         */
        this._spritesheet = new Exo.Spritesheet(this._texture, this._json);

        /**
         * @type {Sprite}
         */
        this._sprite = this._spritesheet.sprites['explosion-0'];

        /**
         * @type {Number}
         */
        this._frame = 0;

        /**
         * @type {Number}
         */
        this._frames = 64;

        for (const sprite of Object.values(this._spritesheet.sprites)) {
            sprite.setAnchor(0.5);
            sprite.setPosition(app.screen.width / 2, app.screen.height / 2);
        }
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        this._frame = (this._frame + 1) % this._frames;
        this._sprite = this._spritesheet.sprites[`explosion-${this._frame}`];
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
