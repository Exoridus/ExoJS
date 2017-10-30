window.app = new Exo.Application({
    basePath: 'assets/',
    canvasParent: '.container-canvas',
    width: 800,
    height: 600,
});

window.app.start(new Exo.Scene({

    /**
     * @param {ResourceLoader} loader
     */
    load(loader) {
        loader.addItem('texture', 'particle', 'image/particle.png')
            .load(() => this.app.trigger('scene:start'));
    },

    /**
     * @param {ResourceContainer} resources
     */
    init(resources) {
        const canvas = this.app.canvas,
            texture = resources.get('texture', 'particle'),
            center = new Exo.Vector(texture.width / 2, texture.height / 2);

        /**
         * @private
         * @member {Random}
         */
        this._random = new Exo.Random();

        /**
         * @private
         * @member {ParticleEmitter}
         */
        this._emitter = new Exo.ParticleEmitter(texture, {
            totalLifetime: new Exo.Time(5, Exo.TIME.SECONDS),
            position: new Exo.Vector((canvas.width / 2) - center.x, (canvas.height / 2) - center.y)
        });

        this._emitter.addModifier(new Exo.TorqueModifier(100));
        this._emitter.addModifier(new Exo.ForceModifier(new Exo.Vector(0, 100)));
        this._emitter.setEmissionRate(30);

        this.app.on('mouse:move', (delta, mouse) => {
            this._emitter.particleOptions.position.set(mouse.x - center.x, mouse.y - center.y);
        });
    },

    /**
     * @param {Time} delta
     */
    update(delta) {
        const displayManager = this.app.displayManager,
            options = this._emitter.particleOptions,
            random = this._random;

        options.color.set(random.next(0, 255), random.next(0, 255), random.next(0, 255), random.next(0, 1));
        options.velocity.set(random.next(-100, 100), random.next(-100, 0));

        this._emitter.update(delta);

        displayManager.begin();
        displayManager.render(this._emitter);
        displayManager.end();
    },
}));
