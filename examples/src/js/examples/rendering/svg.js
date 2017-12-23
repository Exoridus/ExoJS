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
        loader.add('svg', { tiger: 'svg/tiger.svg' });
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const canvas = this.app.canvas;

        /**
         * @private
         * @member {Texture}
         */
        this._texture = new Exo.Texture(resources.get('svg', 'tiger'));

        /**
         * @private
         * @member {Sprite}
         */
        this._tiger = new Exo.Sprite(this._texture);
        this._tiger.setOrigin(0.5);
        this._tiger.setPosition(canvas.width / 2 | 0, canvas.height / 2 | 0);
    },

    /**
     * @param {RenderManager} renderManager
     */
    draw(renderManager) {
        renderManager
            .clear()
            .draw(this._tiger)
            .display();
    },
}));
