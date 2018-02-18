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
        loader.add('font', { example: 'font/AndyBold/AndyBold.woff2' }, { family: 'AndyBold' });
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const screen = this.app.screen;

        /**
         * @private
         * @member {Time}
         */
        this._time = new Exo.Time();

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

        this._text.setPosition(screen.width / 2, screen.height / 2);
        this._text.setAnchor(0.5, 0.5);
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        this._text
            .setText(`Hello World! ${this._time.addTime(delta).seconds | 0}`)
            .rotate(delta.seconds * 36);
    },

    /**
     * @param {RenderManager} renderManager
     */
    draw(renderManager) {
        renderManager.clear()
            .draw(this._text)
            .display();
    },
}));
