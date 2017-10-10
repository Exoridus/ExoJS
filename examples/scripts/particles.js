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
            texture = resources.get('texture', 'particle');

        /**
         * @private
         * @member {Random}
         */
        this.random = new Exo.Random();

        /**
         * @private
         * @member {ParticleOptions}
         */
        this.particleOptions = new Exo.ParticleOptions({
            totalLifetime: new Exo.Time(5, Exo.TIME.SECONDS),
            position: new Exo.Vector((canvas.width - texture.width) / 2, (canvas.height - texture.height) / 2)
        });

        /**
         * @private
         * @member {ParticleEmitter}
         */
        this.emitter = new Exo.ParticleEmitter(texture, this.particleOptions);
        this.emitter.addModifier(new Exo.TorqueModifier(100));
        this.emitter.addModifier(new Exo.ForceModifier(new Exo.Vector(0, 100)));
        this.emitter.setEmissionRate(30);

        this.addNode(this.emitter);

        this.app.on('mouse:move', (delta, mouse) => {
            this.particleOptions.position.set(mouse.x - (texture.width / 2), mouse.y - (texture.height / 2));
        });
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        const random = this.random;

        this.particleOptions.color.set(random.next(0, 255), random.next(0, 255), random.next(0, 255), random.next(0, 1));
        this.particleOptions.velocity.set(random.next(-100, 100), random.next(-100, 0));
        this.emitter.update(delta);
    },
}));
