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
        const resources = this.app.loader.resources,
            canvas = this.app.canvas,
            texture = resources.get('texture', 'particle'),
            emitter = new Exo.ParticleEmitter(texture);

        emitter.emissionRate = 30;
        emitter.particleLifetime = new Exo.Time(5, Exo.Time.Seconds);
        emitter.addModifier(new Exo.TorqueModifier(100));
        emitter.addModifier(new Exo.ForceModifier(new Exo.Vector(0, 100)));
        emitter.particlePosition.set(canvas.width / 2 - (texture.width / 2), canvas.height / 2 - (texture.height / 2));

        this.addNode(emitter);

        /**
         * @private
         * @member {ParticleEmitter}
         */
        this.emitter = emitter;

        /**
         * @private
         * @member {Random}
         */
        this.random = new Exo.Random();

        this.app.on('mouse:move', (delta, mouse) => {
            this.emitter.particlePosition.set(mouse.x - (texture.width / 2), mouse.y - (texture.height / 2));
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
    },
}));
