const app = new Exo.Application({
    loader: new Exo.Loader({
        basePath: 'assets/'
    })
});

app.start(new Exo.Scene({

    /**
     * @param {Loader} loader
     */
    async load(loader) {

        /**
         * @private
         * @member {Texture}
         */
        this._texture = await loader.load('texture', 'image/rainbow.png', { scaleMode: Exo.SCALE_MODES.NEAREST });
    },

    /**
     * @param {Application} app
     */
    init(app) {

        /**
         * @private
         * @type {Time}
         */
        this._time = new Exo.Time();

        /**
         * @private
         * @type {Sprite}
         */
        this._boxA = new Exo.Sprite(this._texture);
        this._boxA.setPosition(app.screen.width / 2, app.screen.height / 2);
        this._boxA.setAnchor(0.5, 0.5);

        /**
         * @private
         * @type {Sprite}
         */
        this._boxB = new Exo.Sprite(this._texture);
        this._boxB.setPosition(app.screen.width / 2, app.screen.height / 2);
        this._boxB.setAnchor(0.5, 0.5);

        this.app.inputManager.onPointerMove.add((pointer) => {
            this._boxB.setPosition(pointer.x, pointer.y);
        });
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        this._time.addTime(delta);

        this._boxA.setScale(0.25 + (Math.cos(this._time.seconds) * 0.5 + 0.5));
        this._boxB.setScale(0.25 + (Math.sin(this._time.seconds - Math.PI / 2) * 0.5 + 0.5));

        this._boxA.setRotation(this._time.seconds * 25);
        this._boxB.setRotation(this._time.seconds * -100);

        this._boxA.setTint(Exo.Color.White);
        this._boxB.setTint(Exo.Color.White);

        if (this._boxA.intersects(this._boxB)) {
            const { shapeAInB, shapeBInA } = this._boxA.getCollision(this._boxB);

            this._boxA.setTint(shapeAInB ? Exo.Color.Cyan : Exo.Color.Red);
            this._boxB.setTint(shapeBInA ? Exo.Color.Cyan : Exo.Color.Red);
            this._boxB.tint.a = 0.5;
        }
    },

    /**
     * @param {RenderManager} renderManager
     */
    draw(renderManager) {
        renderManager.clear()
            .draw(this._boxA)
            .draw(this._boxB)
            .display();
    },
}));
