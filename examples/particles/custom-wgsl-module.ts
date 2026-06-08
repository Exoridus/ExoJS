import { Application, Color, Scene, Texture, Vector } from '@codexo/exojs';
import {
    Constant,
    particlesExtension,
    ParticleSystem,
    RateSpawn,
    UpdateModule,
    type WgslContribution,
} from '@codexo/exojs-particles';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
    extensions: [particlesExtension],
});

document.body.append(app.canvas);

class SwayModule extends UpdateModule {
    amplitude: number;
    frequency: number;

    constructor(amplitude: number, frequency: number) {
        super();
        this.amplitude = amplitude;
        this.frequency = frequency;
    }

    apply(system, dt): void {
        for (let i = 0; i < system.liveCount; i++) {
            system.velX[i] += Math.sin(system.elapsed[i] * this.frequency) * this.amplitude * dt;
        }
    }

    wgsl(): WgslContribution {
        return {
            key: 'SwayModule',
            uniforms: [
                { name: 'amplitude', type: 'f32' },
                { name: 'frequency', type: 'f32' },
            ],
            body: `velocities[idx].x = velocities[idx].x + sin(timing[idx].x * modules.u_SwayModule.frequency) * modules.u_SwayModule.amplitude * dt;`,
        };
    }

    writeUniforms(view: DataView, offset: number): void {
        view.setFloat32(offset + 0, this.amplitude, true);
        view.setFloat32(offset + 4, this.frequency, true);
    }
}

class CustomWgslModuleScene extends Scene {
    private system!: ParticleSystem;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { particle: 'image/particle-light.png' });
    }

    override init(loader): void {
        this.system = new ParticleSystem(loader.get(Texture, 'particle'), { capacity: 26000 });
        this.system.setPosition(400, 540);
        this.system.addSpawnModule(
            new RateSpawn({
                rate: new Constant(1800),
                lifetime: new Constant(2.0),
                velocity: new Constant(new Vector(0, -130)),
                scale: new Constant(new Vector(0.2, 0.2)),
            }),
        );
        this.system.addUpdateModule(new SwayModule(250, 8));
    }

    override update(delta): void {
        this.system.update(delta);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.system);
    }
}

app.start(new CustomWgslModuleScene());
