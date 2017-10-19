window.app = new Exo.Application({
    basePath: 'assets/',
    canvasParent: '.container-canvas',
    width: 800,
    height: 600,
});

window.app.start(new Exo.Scene({

    load(loader) {
        loader.addItem('texture', 'particle', 'image/particle.png')
            .load(() => this.app.trigger('scene:start'));
    },

    init() {
        const canvas = this.app.canvas,
            texture = this.app.loader.resources.get('texture', 'particle'),
            center = new Exo.Vector(texture.width / 2, texture.height / 2);

        /**
         * @private
         * @member {Random}
         */
        this.random = new Exo.Random();

        /**
         * @private
         * @member {ParticleEmitter}
         */
        this.emitter = new Exo.ParticleEmitter(texture, {
            totalLifetime: new Exo.Time(5, Exo.TIME.SECONDS),
            position: new Exo.Vector((canvas.width / 2) - center.x, (canvas.height / 2) - center.y)
        });

        this.emitter.addModifier(new Exo.TorqueModifier(100));
        this.emitter.addModifier(new Exo.ForceModifier(new Exo.Vector(0, 100)));
        this.emitter.setEmissionRate(30);

        this.addNode(this.emitter);

        this.app.on('mouse:move', (delta, mouse) => {
            const { position } = this.emitter.particleOptions;

            position.set(mouse.x - center.x, mouse.y - center.y);
        });
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        const random = this.random,
            { color, velocity } = this.emitter.particleOptions;

        color.set(random.next(0, 255), random.next(0, 255), random.next(0, 255), random.next(0, 1));
        velocity.set(random.next(-100, 100), random.next(-100, 0));

        this.emitter.update(delta);
    },
}));
