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
        loader.addItem('texture', 'atlas', 'image/atlas.png');
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const canvas = this.app.canvas;

        /**
         * @type {Texture}
         */
        this._texture = resources.get('texture', 'atlas');

        /**
         * @type {Rectangle}
         */
        this._textureFrame = new Exo.Rectangle(0, 0, 128, 128);

        /**
         * @type {Sprite}
         */
        this._atlas = new Exo.Sprite(this._texture);
        this._atlas.setPosition(canvas.width / 2, canvas.height / 2);
        this._atlas.setTextureFrame(this._textureFrame);
        this._atlas.setOrigin(0.5, 0.5);

        /**
         * @type {Timer}
         */
        this._ticker = 0;

        /**
         * @type {Number}
         */
        this._framesX = (this._texture.width / this._textureFrame.width) | 0;

        /**
         * @type {Number}
         */
        this._framesY = (this._texture.height / this._textureFrame.height) | 0;
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        this._ticker++;
        this._textureFrame.x = (this._ticker % this._framesX) * this._textureFrame.width;
        this._textureFrame.y = ((this._ticker / this._framesX | 0) % this._framesY) * this._textureFrame.height;
        this._atlas.setTextureFrame(this._textureFrame);

        this.app.displayManager
            .clear()
            .draw(this._atlas)
            .display();
    },

    /**
     * @override
     */
    destroy() {
        this._texture.destroy();
        this._texture = null;

        this._textureFrame.destroy();
        this._textureFrame = null;

        this._atlas.destroy();
        this._atlas = null;

        this._ticker = null;
        this._framesX = null;
        this._framesY = null;
    },
}));
