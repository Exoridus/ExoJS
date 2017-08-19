const random = Exo.Utils.random;

/**
 * @class GameScene
 * @extends {Exo.Scene}
 */
export default class GameScene extends Exo.Scene {

    load(loader) {
        loader.add('texture', 'particle', 'image/particle.png')
            .load()
            .then(() => this.game.trigger('scene:start'));
    }

    init() {

        /**
         * @private
         * @member {Exo.Texture}
         */
        this.texture = this.game.loader.resources.get('texture', 'particle');

        /**
         * @private
         * @member {Exo.Color}
         */
        this.color = new Exo.Color();

        /**
         * @private
         * @member {Exo.Vector}
         */
        this.velocity = new Exo.Vector();

        /**
         * @private
         * @member {Exo.ParticleEmitter}
         */
        this.emitter = new Exo.ParticleEmitter(this.texture);
        this.emitter.emissionRate = 30;
        this.emitter.particleLifeTime = new Exo.Time(5, Exo.Time.Seconds);
        this.emitter.addModifier(new Exo.TorqueModifier(100));
        this.emitter.addModifier(new Exo.ForceModifier(new Exo.Vector(0, 100)));

        this.game.on('mouse:move', (mouse) => {
            this.emitter.particlePosition.set(mouse.x - (this.texture.width / 2), mouse.y - (this.texture.height / 2));
        });
    }

    /**
     * @param {Exo.Time} delta
     */
    update(delta) {
        this.emitter.particleColor = this.color.set(random(0, 255), random(0, 255), random(0, 255), random(0, 1));
        this.emitter.particleVelocity = this.velocity.set(random(-100, 100), random(-100, 0));
        this.emitter.update(delta);

        this.game.trigger('display:begin')
            .trigger('display:render', this.emitter)
            .trigger('display:end');
    }
}
