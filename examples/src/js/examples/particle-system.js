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
        this._texture = await loader.load('texture', 'image/particle.png');
    },

    /**
     * @param {Application} app
     */
    init(app) {

        /**
         * @private
         * @member {Random}
         */
        this._random = new Exo.Random();

        /**
         * @private
         * @member {UniversalEmitter}
         */
        this._emitter = new Exo.UniversalEmitter(50);

        /**
         * @private
         * @member {ColorAffector}
         */
        this._affector = new Exo.ColorAffector(
            new Exo.Color(194, 64, 30, 1),
            new Exo.Color(0, 0, 0, 0)
        );

        /**
         * @private
         * @member {ParticleSystem}
         */
        this._system = new Exo.ParticleSystem(this._texture);
        this._system.setPosition(app.screen.width * 0.5, app.screen.height * 0.75);
        this._system.setBlendMode(Exo.BLEND_MODES.ADD);
        this._system.addEmitter(this._emitter);
        this._system.addAffector(this._affector);
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        const angle = this._random.next(90, 100) * (Math.PI / 180),
            speed = this._random.next(60, 80);

        // this._options.velocity.set(
        //     Math.cos(angle) * speed,
        //     -Math.sin(angle) * speed
        // );
        //
        // this._options.position.set(
        //     this._system.x + this._random.next(-50, 50),
        //     this._system.y + this._random.next(-10, 10)
        // );
        //
        // this._options.totalLifetime.set(this._random.next(5, 10), Exo.TIME.SECONDS);
        this._system.update(delta);
    },

    /**
     * @param {RenderManager} renderManager
     */
    draw(renderManager) {
        renderManager
            .clear()
            .draw(this._system)
            .display();
    },
}));
