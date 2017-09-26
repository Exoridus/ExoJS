window.app = new Exo.Application({
    basePath: 'assets/',
    canvasParent: '.container-canvas',
    width: 800,
    height: 600,
});

window.app.start(new Exo.Scene({

    load(loader) {
        loader.addItem('texture', 'particle', 'image/particle.png')
            .load()
            .then(() => this.app.trigger('scene:start'));
    },

    init() {

        /**
         * @private
         * @member {Texture}
         */
        this.texture = this.app.loader.resources.get('texture', 'particle');

        /**
         * @private
         * @member {Random}
         */
        this.random = new Exo.Random();

        /**
         * @private
         * @member {ParticleEmitter}
         */
        this.emitter = new Exo.ParticleEmitter(this.texture);
        this.emitter.emissionRate = 30;
        this.emitter.particleLifetime = new Exo.Time(5, Exo.Time.Seconds);
        this.emitter.addModifier(new Exo.TorqueModifier(100));
        this.emitter.addModifier(new Exo.ForceModifier(new Exo.Vector(0, 100)));

        this.app.on('mouse:move', (delta, mouse) => {
            this.emitter.particlePosition.set(mouse.x - (this.texture.width / 2), mouse.y - (this.texture.height / 2));
        });
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        const emitter = this.emitter,
            random = this.random;

        emitter.particleColor.set(random.next(0, 255), random.next(0, 255), random.next(0, 255), random.next(0, 1));
        emitter.particleVelocity.set(random.next(-100, 100), random.next(-100, 0));
        emitter.update(delta);

        this.app
            .trigger('display:begin')
            .trigger('display:render', emitter)
            .trigger('display:end');
    },
}));
