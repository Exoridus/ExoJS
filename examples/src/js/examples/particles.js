window.app = new Exo.Application({
    assetsPath: 'assets/',
    canvasParent: document.querySelector('.container-canvas'),
    width: 800,
    height: 600,
});

window.app.start(new Exo.Scene({

    /**
     * @param {ResourceLoader} loader
     */
    load(loader) {
        loader.addItem('texture', 'particle', 'image/particle.png');
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const canvas = this.app.canvas;

        /**
         * @private
         * @member {Random}
         */
        this._random = new Exo.Random();

        /**
         * @private
         * @member {Texture}
         */
        this._texture = resources.get('texture', 'particle');

        /**
         * @private
         * @member {ParticleEmitter}
         */
        this._emitter = new Exo.ParticleEmitter(this._texture, {
            totalLifetime: new Exo.Time(5, Exo.TIME.SECONDS),
        });

        this._emitter.addModifier(new Exo.TorqueModifier(100));
        this._emitter.addModifier(new Exo.ForceModifier(new Exo.Vector(0, 100)));
        this._emitter.setEmissionRate(30);

        this.app.on('mouse:move', (mouse) => {
            this.setParticleCenter(mouse.x, mouse.y);
        });

        this.setParticleCenter(canvas.width / 2, canvas.height / 2);
    },

    /**
     * @private
     * @param {Number} x
     * @param {Number} y
     */
    setParticleCenter(x, y) {
        this._emitter.particlePosition.set(x - (this._texture.width / 2), y - (this._texture.height / 2));
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        const random = this._random;

        this._emitter.particleTint.set(random.next(0, 255), random.next(0, 255), random.next(0, 255), random.next(0, 1));
        this._emitter.particleVelocity.set(random.next(-100, 100), random.next(-100, 0));
        this._emitter.update(delta);
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

        this._texture.destroy();
        this._texture = null;

        this._emitter.destroy();
        this._emitter = null;
    },
}));
