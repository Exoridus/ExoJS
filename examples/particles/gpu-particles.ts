import { Application, Color, FixedResolutionCanvasSizing, RenderBackendType, type RenderingContext, Scene, type Seconds, Vector } from '@codexo/exojs';
import { AlphaFadeOverLifetime, ApplyForce, ConeDirection, Constant, particlesExtension, ParticleSystem, Range, RateSpawn } from '@codexo/exojs-particles';
import { mountControls } from '@examples/runtime';

// WebGPU runs the whole simulation on a compute shader, so it sustains hundreds
// of thousands of particles smoothly; WebGL2 falls back to a CPU integrator, so
// it uses a much smaller budget to stay at a comfortable frame rate. Both stay
// well within what a modern machine handles without lag.
const budgets = {
  webgpu: { capacity: 320_000, rate: 75_000 },
  webgl2: { capacity: 20_000, rate: 3_000 },
};

class GpuParticlesScene extends Scene {
  private system!: ParticleSystem;
  private hud!: ReturnType<typeof mountControls>;
  private capacity = 0;

  override init(): void {
    const app = this.app;
    const { width, height } = app;
    // Read here rather than beside the Application: a WebGPU request that finds
    // no adapter falls back to WebGL2 during start(), so before the scene is
    // activated the backend can still be the requested one rather than the one
    // that came up - and these two budgets differ sixteenfold.
    const isWebGpu = app.backend.backendType === RenderBackendType.WebGpu;
    const { capacity, rate } = isWebGpu ? budgets.webgpu : budgets.webgl2;

    this.capacity = capacity;
    this.system = new ParticleSystem(this.loader.get('image/particle-light.png'), { capacity });
    this.systems.add(this.system);
    this.system.setPosition(width / 2, height - 80);
    this.system.addSpawnModule(
      new RateSpawn({
        rate: new Constant(rate),
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

  override update(_delta: Seconds): void {
    const backend = this.system.gpuMode ? 'WebGPU (GPU compute)' : 'WebGL2 (CPU fallback)';

    this.hud.setStatus(`${this.system.aliveCount.toLocaleString()} live / ${this.capacity.toLocaleString()} cap · ${backend}`);
  }

  override draw(context: RenderingContext): void {
    context.render(this.system);
  }
}

const app = new Application({
  scenes: { GpuParticlesScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
  loader: {
    basePath: 'assets/',
  },
  extensions: [particlesExtension],
});

await app.start(GpuParticlesScene);
