import { Application, Color, FixedResolutionCanvasSizing, RenderBackendType, type RenderingContext, Scene, Vector } from '@codexo/exojs';
import { AlphaFadeOverLifetime, ApplyForce, ConeDirection, Constant, particlesExtension, ParticleSystem, Range, RateSpawn } from '@codexo/exojs-particles';
import { mountControlPanel, mountControls } from '@examples/runtime';

// Illustrative loads for the two GPU backends; measure on target hardware.
const budgets = {
  webgpu: { capacity: 320_000, rate: 75_000 },
  webgl2: { capacity: 20_000, rate: 3_000 },
};

class GpuParticlesScene extends Scene {
  private system!: ParticleSystem;
  private hud!: ReturnType<typeof mountControls>;
  private capacity = 0;
  private spawnRate!: Constant<number>;
  private frameIntervalMs = 0;

  override init(): void {
    const app = this.app;
    const { width, height } = app;
    // Backend fallback is resolved before scene activation.
    const isWebGpu = app.backend.backendType === RenderBackendType.WebGpu;
    const { capacity, rate } = isWebGpu ? budgets.webgpu : budgets.webgl2;

    this.capacity = capacity;
    this.spawnRate = new Constant(rate);
    this.system = new ParticleSystem(this.loader.get('image/particle-light.png'), { capacity });
    this.systems.add(this.system);
    this.system.setPosition(width / 2, height - 80);
    this.system.addSpawnModule(
      new RateSpawn({
        rate: this.spawnRate,
        lifetime: new Range(2.6, 3.8),
        velocity: new ConeDirection(-Math.PI / 2, Math.PI / 4, 120, 340),
        scale: new Constant(new Vector(0.22, 0.22)),
      }),
    );
    this.system.addUpdateModule(new ApplyForce(0, 320));
    this.system.addUpdateModule(new AlphaFadeOverLifetime());

    this.hud = mountControls({
      title: 'Particle Capacity',
      hint: 'Quad simulation uses WebGPU compute or WebGL2 transform feedback when eligible. Frame interval includes the whole application.',
    });
    mountControlPanel({ title: 'Load' }).addSlider({
      label: 'Spawn / second',
      min: 0,
      max: rate,
      step: isWebGpu ? 5000 : 250,
      value: rate,
      onChange: value => {
        this.spawnRate.value = value;
      },
    });
  }

  override update(): void {
    const backend = { cpu: 'CPU', webgl2: 'WebGL2 transform feedback', webgpu: 'WebGPU compute' }[this.system.simulationBackend];
    // The `update` delta is clamped for simulation stability and would hide a
    // slow frame; the raw frame-to-frame delta is what the display actually got.
    const { rawFrameDeltaMs } = this.app.backend.stats;

    this.frameIntervalMs = this.frameIntervalMs * 0.9 + rawFrameDeltaMs * 0.1;
    this.hud.setStatus(
      `${this.system.aliveCount.toLocaleString()} live / ${this.capacity.toLocaleString()} cap · ${this.spawnRate.value.toLocaleString()}/s · ${this.frameIntervalMs.toFixed(1)} ms between frames · ${backend}`,
    );
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
