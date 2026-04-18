import { Application, Color, Scene, Container, Sprite, Texture } from 'exojs';

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
        this._velocityByBunny = new WeakMap();
        this._startAmount = 10;
        this._addAmount = 50;
        this._maxX = width;
        this._maxY = height;
        this._addBunnies = false;
        this._stats = this.createStats();
        this._counter = this.createCounter();

        this.app.inputManager.onPointerDown.add(() => {
            this._addBunnies = true;
        });

        this.app.inputManager.onPointerUp.add(() => {
            this._addBunnies = false;
        });

        this.createBunnies(this._startAmount);
    },

    createBunnies(amount) {
        for (let i = 0; i < amount; i++) {
            const bunny = new Sprite(this._bunnyTexture);

            this._velocityByBunny.set(bunny, {
                x: Math.random() * 10,
                y: Math.random() * 10,
            });

            this._bunnies.addChild(bunny);
        }
    },

    createStats() {
        const stats = new Stats();

        stats.dom.style.position = 'absolute';
        stats.dom.style.top = '0';
        stats.dom.style.left = '0';

        document.body.appendChild(stats.dom);

        return stats;
    },

    createCounter() {
        // HTML overlay to match the stats.js FPS widget. The count updates
        // continuously while the pointer is held, but DOM textContent updates
        // with fixed-width digits don't cause layout reflow — so this is no
        // heavier than a Text sprite with an invalidated texture cache, and
        // keeps a render-loop measurement unaffected by GPU text upload cost.
        const counter = document.createElement('div');
        counter.style.position = 'absolute';
        counter.style.top = '52px';
        counter.style.left = '0';
        counter.style.padding = '3px 8px';
        counter.style.background = '#002';
        counter.style.color = '#0ff';
        counter.style.font = '9px "Helvetica Neue", Helvetica, Arial, sans-serif';
        counter.style.fontWeight = 'bold';
        counter.style.lineHeight = '15px';
        counter.style.fontVariantNumeric = 'tabular-nums';
        counter.textContent = 'BUNNIES 0';
        document.body.appendChild(counter);
        return counter;
    },

    update() {
        this._stats.begin();

        if (this._addBunnies) {
            this.createBunnies(this._addAmount);
            this._counter.textContent = 'BUNNIES ' + this._bunnies.children.length;
        }

        for (const bunny of this._bunnies.children) {
            const velocity = this._velocityByBunny.get(bunny);
            if (!velocity) {
                continue;
            }

            velocity.y += 0.75;
            bunny.move(velocity.x, velocity.y);

            if (bunny.x + bunny.width > this._maxX) {
                velocity.x *= -1;
                bunny.x = this._maxX - bunny.width;
            } else if (bunny.x < 0) {
                velocity.x *= -1;
                bunny.x = 0;
            }

            if (bunny.y + bunny.height > this._maxY) {
                velocity.y *= -0.85;
                bunny.y = this._maxY - bunny.height;

                if (Math.random() > 0.5) {
                    velocity.y -= Math.random() * 6;
                }
            } else if (bunny.y < 0) {
                velocity.y *= -1;
                bunny.y = 0;
            }
        }
    },

    draw(renderManager) {
        renderManager.clear();
        this._bunnies.render(renderManager);

        this._stats.end();
    },
}));
