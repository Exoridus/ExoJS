window.app.start(new Exo.Scene({

    /**
     * @param {ResourceLoader} loader
     */
    load(loader) {
        loader.add('texture', {
            particle: 'image/particle.png'
        });
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const canvas = this.app.canvas;

        /**
         * @private
         * @member {ColorModifier}
         */
        this._colorModifier = new Exo.ColorModifier(
            new Exo.Color(194, 64, 30, 1),
            new Exo.Color(0, 0, 0, 0)
        );

        /**
         * @private
         * @member {ParticleEmitter}
         */
        this._emitter = new Exo.ParticleEmitter(resources.get('texture', 'particle'));
        this._emitter.setPosition(canvas.width * 0.5, canvas.height * 0.75);
        this._emitter.setBlendMode(Exo.BLEND_MODES.ADD);
        this._emitter.addModifier(this._colorModifier);
        this._emitter.setEmissionRate(50);

        /**
         * @private
         * @member {Random}
         */
        this._random = new Exo.Random();
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        const emitter = this._emitter,
            random = this._random,
            angle = random.next(90, 100) * (Math.PI / 180),
            speed = random.next(60, 80);

        emitter.particleTotalLifetime.set(random.next(5, 10), Exo.TIME.SECONDS);
        emitter.particlePosition.set(emitter.x + random.next(-50, 50), emitter.y + random.next(-10, 10));
        emitter.particleVelocity.set(Math.cos(angle) * speed, -Math.sin(angle) * speed);
        emitter.update(delta);
    },

    /**
     * @param {RenderManager} renderManager
     */
    draw(renderManager) {
        renderManager
            .clear()
            .draw(this._emitter)
            .display();
    },

    /**
     * @override
     */
    destroy() {
        this._random.destroy();
        this._random = null;

        this._colorModifier.destroy();
        this._colorModifier = null;

        this._emitter.destroy();
        this._emitter = null;
    },
}));
