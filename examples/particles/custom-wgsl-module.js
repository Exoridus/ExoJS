import { Application, Color, Constant, ParticleSystem, RateSpawn, Scene, Texture, UpdateModule, Vector } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

class SwayModule extends UpdateModule {
    constructor(amplitude, frequency) {
        super();
        this.amplitude = amplitude;
        this.frequency = frequency;
    }
    apply(system, dt) {
        for (let i = 0; i < system.liveCount; i++) {
            system.velX[i] += Math.sin(system.elapsed[i] * this.frequency) * this.amplitude * dt;
        }
    }
    wgsl() {
        return {
            key: 'SwayModule',
            uniforms: [
                { name: 'amplitude', type: 'f32' },
                { name: 'frequency', type: 'f32' },
            ],
            body: `velocities[idx].x = velocities[idx].x + sin(timing[idx].x * modules.u_SwayModule.frequency) * modules.u_SwayModule.amplitude * dt;`,
        };
    }
    writeUniforms(view, offset) {
        view.setFloat32(offset + 0, this.amplitude, true);
        view.setFloat32(offset + 4, this.frequency, true);
    }
}

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { particle: 'image/particle.png' });
        }
        init(loader) {
            this._system = new ParticleSystem(loader.get(Texture, 'particle'), { capacity: 26000 });
            this._system.setPosition(400, 540);
            this._system.addSpawnModule(
                new RateSpawn({
                    rate: new Constant(1800),
                    lifetime: new Constant(2.0),
                    velocity: new Constant(new Vector(0, -130)),
                    scale: new Constant(new Vector(0.2, 0.2)),
                })
            );
            this._system.addUpdateModule(new SwayModule(250, 8));
        }
        update(delta) {
            this._system.update(delta);
        }
        draw(backend) {
            backend.clear();
            this._system.render(backend);
        }
    })()
);
