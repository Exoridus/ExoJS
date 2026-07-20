import { Application, Color, RenderBackendType, type RenderingContext, Scene, type Time, Vector } from '@codexo/exojs';
import {
    AlphaFadeOverLifetime,
    ApplyForce,
    ConeDirection,
    Constant,
    particlesExtension,
    ParticleSystem,
    Range,
    RateSpawn,
} from '@codexo/exojs-particles';
import { mountControls } from '@examples/runtime';

class GpuParticlesScene extends Scene {
    private system!: ParticleSystem;
    private hud!: ReturnType<typeof mountControls>;

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        this.system = new ParticleSystem(this.loader.get('image/particle-light.png'), { capacity: CAPACITY });
        this.system.setPosition(width / 2, height - 80);
        this.system.addSpawnModule(
            new RateSpawn({
                rate: new Constant(RATE),
                lifetime: new Range(2.6, 3.8),
                velocity: new ConeDirection(-Math.PI / 2, Math.PI / 4, 120, 340),
                scale: new Constant(new Vector(0.22, 0.22)),
            }),
        );
        this.system.addUpdateModule(new ApplyForce(0, 320));
        this.system.addUpdateModule(new AlphaFadeOverLifetime());

        this.hud = mountControls({
            title: 'GPU Particles',
            hint: isWebGpu
                ? 'WebGPU compute simulation — hundreds of thousands of particles, no CPU per-particle work.'
                : 'WebGL2 CPU fallback — a smaller budget keeps the CPU integrator smooth.',
        });
    }

    override update(delta: Time): void {
        this.system.update(delta);

        const backend = this.system.gpuMode ? 'WebGPU (GPU compute)' : 'WebGL2 (CPU fallback)';

        this.hud.setStatus(`${this.system.aliveCount.toLocaleString()} live / ${CAPACITY.toLocaleString()} cap · ${backend}`);
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.system);
    }
}

const app = new Application({
    scenes: { GpuParticlesScene },
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
    extensions: [particlesExtension],
});

// WebGPU runs the whole simulation on a compute shader, so it sustains hundreds
// of thousands of particles smoothly; WebGL2 falls back to a CPU integrator, so
// it uses a much smaller budget to stay at a comfortable frame rate. Both stay
// well within what a modern machine handles without lag.
const isWebGpu = app.backend.backendType === RenderBackendType.WebGpu;
const CAPACITY = isWebGpu ? 320_000 : 20_000;
const RATE = isWebGpu ? 75_000 : 3_000;

app.start(GpuParticlesScene);
