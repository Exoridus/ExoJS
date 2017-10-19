window.app = new Exo.Application({
    basePath: 'assets/',
    canvasParent: '.container-canvas',
    width: 800,
    height: 600,
});

window.app.start(new Exo.Scene({

    load(loader) {
        loader.addItem('texture', 'bunny', 'image/bunny.png')
            .load(() => this.app.trigger('scene:start'));
    },

    init() {
        const app = this.app,
            canvas = app.canvas;

        this.bunnyTexture = app.loader.resources.get('texture', 'bunny');

        this.startAmount = 10;
        this.addAmount = 50;

        this.maxX = canvas.width;
        this.maxY = canvas.height;

        app.trigger('input:add', new Exo.Input([
            Exo.KEYS.Space,
            Exo.MOUSE.LeftButton,
            Exo.GAMEPAD.FaceButtonBottom,
        ], {
            context: this,
            active() {
                this.createBunnies(this.addAmount);
            },
        }));

        this.createBunnies(this.startAmount);
    },

    createBunnies(amount) {
        for (let i = 0; i < amount; i++) {
            const bunny = new Exo.Sprite(this.bunnyTexture);

            bunny.speedX = Math.random() * 10;
            bunny.speedY = Math.random() * 10;

            this.addNode(bunny);
        }
    },

    update() {
        for (const bunny of this.nodes) {
            bunny.speedY += 0.75;
            bunny.translate(bunny.speedX, bunny.speedY);

            if (bunny.x + bunny.width > this.maxX) {
                bunny.speedX *= -1;
                bunny.x = this.maxX - bunny.width;
            } else if (bunny.x < 0) {
                bunny.speedX *= -1;
                bunny.x = 0;
            }

            if (bunny.y + bunny.height > this.maxY) {
                bunny.speedY *= -0.85;
                bunny.y = this.maxY - bunny.height;

                if (Math.random() > 0.5) {
                    bunny.speedY -= Math.random() * 6;
                }
            } else if (bunny.y < 0) {
                bunny.speedY *= -1;
                bunny.y = 0;
            }
        }
    },
}));
