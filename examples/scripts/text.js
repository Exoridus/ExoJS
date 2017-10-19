window.app = new Exo.Application({
    basePath: 'assets/',
    canvasParent: '.container-canvas',
    width: 800,
    height: 600,
});

window.app.start(new Exo.Scene({

    load(loader) {
        loader.addItem('font', 'example', 'font/AndyBold/AndyBold.woff2', { family: 'AndyBold' })
            .addItem('texture', 'rainbow', 'image/rainbow.png')
            .load(() => this.app.trigger('scene:start'));
    },

    init() {
        const resources = this.app.loader.resources,
            canvas = this.app.canvas;

        /**
         * @type {Sprite}
         */
        this.rainbow = new Exo.Sprite(resources.get('texture', 'rainbow'));

        /**
         * @private
         * @member {FontFace}
         */
        this.font = resources.get('font', 'example');

        /**
         * @private
         * @member {Text}
         */
        this.text = new Exo.Text('Hello World!', {
            align: 'left',
            fill: 'white',
            stroke: 'black',
            strokeThickness: 3,
            fontSize: 25,
            fontFamily: 'AndyBold',
        });

        this.text.setPosition(canvas.width / 2, canvas.height / 2);
        this.text.setOrigin(0.5);

        this.addNode(this.rainbow)
            .addNode(this.text);
    },

    update(delta) {
        const bounds = this.text.getBounds();

        this.text.rotate(delta.seconds * 36);

        this.rainbow.x = bounds.x;
        this.rainbow.y = bounds.y;
        this.rainbow.width = bounds.width;
        this.rainbow.height = bounds.height;
    }
}));
