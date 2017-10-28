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
        loader.addItem('texture', 'bunny', 'image/bunny.png')
            .load(() => this.app.trigger('scene:start'));
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const app = this.app,
            canvas = app.canvas;

        this._bunnyTexture = resources.get('texture', 'bunny');

        this._startAmount = 10;
        this._addAmount = 50;

        this._maxX = canvas.width;
        this._maxY = canvas.height;

        app.trigger('input:add', new Exo.Input([
            Exo.KEYBOARD.Space,
            Exo.POINTER.MouseLeft,
            Exo.GAMEPAD.FaceBottom,
        ], {
            context: this,
            active() {
                this.createBunnies(this._addAmount);
            },
        }));

        this.createBunnies(this._startAmount);
    },

    createBunnies(amount) {
        for (let i = 0; i < amount; i++) {
            const bunny = new Exo.Sprite(this._bunnyTexture);

            bunny._speedX = Math._random() * 10;
            bunny._speedY = Math._random() * 10;

            this.addNode(bunny);
        }
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        for (const bunny of this.nodes) {
            bunny._speedY += 0.75;
            bunny.translate(bunny._speedX, bunny._speedY);

            if (bunny.x + bunny.width > this._maxX) {
                bunny._speedX *= -1;
                bunny.x = this._maxX - bunny.width;
            } else if (bunny.x < 0) {
                bunny._speedX *= -1;
                bunny.x = 0;
            }

            if (bunny.y + bunny.height > this._maxY) {
                bunny._speedY *= -0.85;
                bunny.y = this._maxY - bunny.height;

                if (Math._random() > 0.5) {
                    bunny._speedY -= Math._random() * 6;
                }
            } else if (bunny.y < 0) {
                bunny._speedY *= -1;
                bunny.y = 0;
            }
        }
    },
}));
