import { Application, Color, Scene, Container, Sprite, Timer, milliseconds, Random, Texture } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

app.start(Scene.create({

    async load(loader) {
        await loader.load(Texture, { bunny: 'image/bunny.png' });
    },
    init(loader) {
        const { width, height } = this.app.canvas;

        this._bunnyTexture = loader.get(Texture, 'bunny');
        this._bunnies = new Container();

        for (let i = 0; i < 25; i++) {
            const bunny = new Sprite(this._bunnyTexture);

            bunny.setPosition(
                (i % 5) * (bunny.width + 10),
                (i / 5 | 0) * (bunny.height + 10)
            );

            this._bunnies.addChild(bunny);
        }

        this._bunnies.setPosition(width / 2 | 0, height / 2 | 0);
        this._bunnies.setAnchor(0.5, 0.5);

        this._timer = new Timer(milliseconds(500), true);
        this._random = new Random();

        this.tintBunnies();
    },

    tintBunnies() {
        for (const bunny of this._bunnies.children) {
            bunny.tint.set(
                this._random.next(50, 255),
                this._random.next(50, 255),
                this._random.next(50, 255)
            );
        }
    },

    update() {
        if (this._timer.expired) {
            this.tintBunnies();
            this._timer.restart();
        }
    },

    draw(renderManager) {
        renderManager.clear();
        this._bunnies.render(renderManager);
    },
}));
