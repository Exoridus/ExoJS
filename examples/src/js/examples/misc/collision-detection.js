const app = new Exo.Application({
    resourcePath: 'assets/',
    canvasParent: document.body,
    width: 800,
    height: 600,
});

app.start(new Exo.Scene({

    /**
     * @param {Loader} loader
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
        this._boxA = new Exo.Sprite(resources.get('texture', 'rainbow'));
        this._boxA.setPosition(canvas.width / 2, canvas.height / 2);
        this._boxA.setAnchor(0.5, 0.5);

        /**
         * @type {Sprite}
         */
        this._boxB = new Exo.Sprite(resources.get('texture', 'rainbow'));
        this._boxB.setAnchor(0.5, 0.5);
        this._boxB.setScale(0.5, 0.5);

        /**
         * @type {Container}
         */
        this._container = new Exo.Container();
        this._container.addChild(this._boxA);
        this._container.addChild(this._boxB);

        /**
         * @type {Number}
         */
        this._ticker = 0;

        this.app.inputManager.onPointerMove.add((pointer) => (this._boxB.position = pointer.position));
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        this._boxA.setScale(0.5 + (Math.cos(this._ticker) * 0.25 + 0.25));
        this._boxA.setRotation(this._ticker * 25);
        this._boxB.setRotation(this._ticker * -100);

        for (const child of this._container.children) {
            child.setTint(Exo.Color.White);
        }

        for (const childA of this._container.children) {
            for (const childB of this._container.children) {
                if (childA === childB) {
                    continue;
                }

                const collision = childA.getCollision(childB);

                if (collision !== null) {
                    childA.setTint(collision.shapeAInB ? Exo.Color.Green : Exo.Color.Red);
                    childB.setTint(collision.shapeBInA ? Exo.Color.Green : Exo.Color.Red);
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
}));
