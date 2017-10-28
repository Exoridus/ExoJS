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
        loader.addItem('font', 'example', 'font/AndyBold/AndyBold.woff2', { family: 'AndyBold' })
            .addItem('texture', 'rainbow', 'image/rainbow.png')
            .load(() => this.app.trigger('scene:start'));
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const canvas = this.app.canvas;

        /**
         * @private
         * @member {Time}
         */
        this._ticker = new Exo.Time();

        /**
         * @private
         * @member {Text}
         */
        this._text = new Exo.Text('Hello World!', {
            align: 'left',
            fill: 'white',
            stroke: 'black',
            strokeThickness: 3,
            fontSize: 25,
            fontFamily: 'AndyBold',
        });
        this._text.setPosition(canvas.width / 2, canvas.height / 2);
        this._text.setOrigin(0.5, 0.5);

        this.addNode(this._text);
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        this._text
            .setText(`Hello World! ${this._ticker.add(delta).seconds | 0}`)
            .rotate(delta.seconds * 36);
    }
}));
