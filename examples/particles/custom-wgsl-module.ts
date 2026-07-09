import { Application, Color, Scene, Vector } from '@codexo/exojs';
import {
    Constant,
    particlesExtension,
    ParticleSystem,
    RateSpawn,
    UpdateModule,
    type WgslContribution,
} from '@codexo/exojs-particles';
import { mountControls } from '@examples/runtime';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
    extensions: [particlesExtension],
});

/**
 * A custom update module that nudges each particle's horizontal velocity with a
 * per-particle sine wave, producing a swaying rising column. It ships BOTH a CPU
 * `apply()` loop and a GPU `wgsl()` body. The particle system auto-selects:
 * WebGPU backend ⇒ the WGSL body runs in the compute shader (no CPU readback);
 * any other backend (incl. WebGL2) ⇒ the `apply()` loop runs on the CPU. Both
 * paths compute the same motion — the on-screen readout reveals which one is live.
 */
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
    private hud!: ReturnType<typeof mountControls>;
    private reportedMode = false;

    override async load(loader): Promise<void> {
        await loader.load(assets.demo.textures.particleLight);
    }

    override init(loader): void {
        const { width, height } = this.app.canvas;

        this.system = new ParticleSystem(loader.get(assets.demo.textures.particleLight), { capacity: 26000 });
        this.system.setPosition(width / 2, height - 60);
        this.system.addSpawnModule(
            new RateSpawn({
                rate: new Constant(1800),
                lifetime: new Constant(2.0),
                velocity: new Constant(new Vector(0, -130)),
                scale: new Constant(new Vector(0.2, 0.2)),
            }),
        );
        this.system.addUpdateModule(new SwayModule(250, 8));

        this.hud = mountControls({
            title: 'Custom WGSL Module',
            controls: [{ keys: 'Auto', action: 'CPU on WebGL2 · GPU on WebGPU' }],
            // GPU vs CPU routing is decided on the first update() once the
            // backend is known — show "detecting" until then.
            status: 'Compute path: detecting…',
            hint: 'The SwayModule supplies both a CPU apply() and a GPU wgsl() body; the system picks one.',
        });
    }

    override update(delta): void {
        this.system.update(delta);

        // gpuMode is only meaningful after the first update() compiled the
        // pipeline. Report it once it has settled.
        if (!this.reportedMode) {
            this.reportedMode = true;
            this.hud.setStatus(this.system.gpuMode ? 'Compute path: GPU (WGSL compute shader)' : 'Compute path: CPU (apply fallback)');
        }
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.system);
    }
}

app.start(new CustomWgslModuleScene());
