window.app = new Exo.Application({
    basePath: 'assets/',
    canvasParent: '.container-canvas',
    width: 800,
    height: 600,
});

window.app.start(new Exo.Scene({

    load(loader) {
        loader.addItem('texture', 'bunny', 'image/bunny.png')
            .load()
            .then(() => this.app.trigger('scene:start'));
    },

    init() {
        const app = this.app,
            canvas = app.canvas;

        this.bunnies = [];
        this.bunnyTexture = app.loader.resources.get('texture', 'bunny');

        this.startAmount = 10;
        this.addAmount = 50;

        this.maxX = canvas.width;
        this.maxY = canvas.height;

        app.trigger('input:add', new Exo.Input([
            Exo.Keyboard.Space,
            Exo.Mouse.LeftButton,
            Exo.Gamepad.FaceButtonBottom,
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

            this.bunnies.push(bunny);
        }
    },

    update() {
        const app = this.app,
            bunnies = this.bunnies,
            len = bunnies.length,
            maxX = this.maxX,
            maxY = this.maxY;

        app.trigger('display:begin');

        for (let i = 0; i < len; i++) {
            const bunny = bunnies[i];

            bunny.speedY += 0.75;
            bunny.move(bunny.speedX, bunny.speedY);

            if (bunny.x + bunny.width > maxX) {
                bunny.speedX *= -1;
                bunny.x = maxX - bunny.width;
            } else if (bunny.x < 0) {
                bunny.speedX *= -1;
                bunny.x = 0;
            }

            if (bunny.y + bunny.height > maxY) {
                bunny.speedY *= -0.85;
                bunny.y = maxY - bunny.height;

                if (Math.random() > 0.5) {
                    bunny.speedY -= Math.random() * 6;
                }
            } else if (bunny.y < 0) {
                bunny.speedY *= -1;
                bunny.y = 0;
            }

            app.trigger('display:render', bunny);
        }

        app.trigger('display:end');
    },
}));
