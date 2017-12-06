const app = new Exo.Application({
    resourcePath: 'assets/',
    clearColor: Exo.Color.Black,
    canvasParent: document.body,
    width: 800,
    height: 600,
});

app.start(new Exo.Scene({

    /**
     * @param {ResourceLoader} loader
     */
    load(loader) {
        loader.add('texture', { rainbow: 'image/rainbow.png' });
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const canvas = this.app.canvas;

        /**
         * @type {Sprite}
         */
        this._boxL = new Exo.Sprite(resources.get('texture', 'rainbow'));
        this._boxL.setPosition((canvas.width / 2) - 100, canvas.height / 2);
        this._boxL.setOrigin(0.5, 0.5);

        /**
         * @type {Sprite}
         */
        this._boxR = new Exo.Sprite(resources.get('texture', 'rainbow'));
        this._boxR.setPosition((canvas.width / 2) + 100, canvas.height / 2);
        this._boxR.setOrigin(0.5, 0.5);

        /**
         * @type {Container}
         */
        this._container = new Exo.Container();
        this._container.addChild(this._boxL);
        this._container.addChild(this._boxR);

        /**
         * @type {Number}
         */
        this._ticker = 0;

        /**
         * @type {?Pointer}
         */
        this._pointer = null;

        this.app.on('pointer:enter', (pointer) => (this._pointer = pointer));
        this.app.on('pointer:leave', () => (this._pointer = null));
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        const rotation = this._ticker * 10,
            scale = 0.5 + (Math.sin(this._ticker) * 0.25 + 0.25);

        this._boxL.setRotation(rotation);
        this._boxL.setScale(scale);

        this._boxR.setRotation(rotation * -1);
        this._boxR.setScale(scale);

        for (const child of this._container.children) {
            child.setTint(Exo.Color.White);
        }

        for (const childA of this._container.children) {
            for (const childB of this._container.children) {
                if (childB === childA) {
                    continue;
                }

                if (childB.intersects(childA)) {
                    childA.setTint(Exo.Color.Red);
                    childB.setTint(Exo.Color.Red);
                }

                if (this._pointer) {
                    if (childA.contains(this._pointer.x, this._pointer.y)) {
                        childA.setTint(Exo.Color.Green);
                    }

                    if (childB.contains(this._pointer.x, this._pointer.y)) {
                        childB.setTint(Exo.Color.Green);
                    }
                }
            }
        }

        this._ticker += delta.seconds;
    },

    /**
     * @param {RenderManager} renderManager
     */
    draw(renderManager) {
        renderManager.clear()
            .draw(this._container)
            .display();
    },

    /**
     * @override
     */
    destroy() {
        this.app.off('pointer:enter');
        this.app.off('pointer:leave');

        this._container.destroy();
        this._container = null;

        this._boxL.destroy();
        this._boxL = null;

        this._boxR.destroy();
        this._boxR = null;

        this._pointer = null;
        this._ticker = null;
    },
}));
