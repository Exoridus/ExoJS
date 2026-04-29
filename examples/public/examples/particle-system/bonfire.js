import { Application, Color, Scene, ParticleOptions, ColorAffector, UniversalEmitter, ParticleSystem, BlendModes, rand, seconds, Texture } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

app.start(new class extends Scene {

    async load(loader) {
        await loader.load(Texture, { particle: 'image/particle.png' });
    }
    init(loader) {
        const { width, height } = this.app.canvas;

        this._particleOptions = new ParticleOptions();
        this._colorAffector = new ColorAffector(new Color(194, 64, 30, 1), new Color(0, 0, 0, 0));
        this._particleEmitter = new UniversalEmitter(50, this._particleOptions);

        this._particleSystem = new ParticleSystem(loader.get(Texture, 'particle'));
        this._particleSystem.setPosition(width * 0.5, height * 0.75);
        this._particleSystem.setBlendMode(BlendModes.Additive);
        this._particleSystem.addAffector(this._colorAffector);
        this._particleSystem.addEmitter(this._particleEmitter);
    }
    update(delta) {
        const angle = rand(90, 100) * (Math.PI / 180);
        const speed = rand(60, 80);

        this._particleOptions.totalLifetime.copy(seconds(rand(5, 10)));
        // Particle positions are LOCAL to the system; the system's own
        // transform places them in world space. Setting world coordinates
        // here would double the translation and push the emitter off-screen.
        this._particleOptions.position.set(rand(-50, 50), rand(-10, 10));
        this._particleOptions.velocity.set(Math.cos(angle) * speed, -Math.sin(angle) * speed);

        this._particleSystem.update(delta);
    }
    draw(backend) {
        backend.clear();
        this._particleSystem.render(backend);
    }
});
