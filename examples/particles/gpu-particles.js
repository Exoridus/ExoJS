// Auto-generated from gpu-particles.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, RenderBackendType, Scene, Vector } from '@codexo/exojs';
import { AlphaFadeOverLifetime, ApplyForce, ConeDirection, Constant, particlesExtension, ParticleSystem, Range, RateSpawn } from '@codexo/exojs-particles';
import { mountControlPanel, mountControls } from '@examples/runtime';
// WebGPU runs the whole simulation on a compute shader; WebGL2 falls back to a
// CPU integrator and therefore starts from a much smaller budget. The slider
// and the timing readout show where a given machine stops keeping up.
const budgets = {
  webgpu: { capacity: 320_000, rate: 75_000 },
  webgl2: { capacity: 20_000, rate: 3_000 },
};
class GpuParticlesScene extends Scene {
  system;
  hud;
  capacity = 0;
  spawnRate;
  frameIntervalMs = 0;
  init() {
    const app = this.app;
    const { width, height } = app;
    // Read here rather than beside the Application: a WebGPU request that finds
    // no adapter falls back to WebGL2 during start(), so before the scene is
    // activated the backend can still be the requested one rather than the one
    // that came up - and these two budgets differ sixteenfold.
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
      hint: isWebGpu
        ? 'WebGPU compute simulation — hundreds of thousands of particles, no CPU per-particle work.'
        : 'WebGL2 CPU fallback — a smaller budget keeps the CPU integrator smooth.',
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
  update() {
    const backend = this.system.gpuMode ? 'WebGPU (GPU compute)' : 'WebGL2 (CPU fallback)';
    // The `update` delta is clamped for simulation stability and would hide a
    // slow frame; the raw frame-to-frame delta is what the display actually got.
    const { rawFrameDeltaMs } = this.app.backend.stats;
    this.frameIntervalMs = this.frameIntervalMs * 0.9 + rawFrameDeltaMs * 0.1;
    this.hud.setStatus(
      `${this.system.aliveCount.toLocaleString()} live / ${this.capacity.toLocaleString()} cap · ${this.spawnRate.value.toLocaleString()}/s · ${this.frameIntervalMs.toFixed(1)} ms between frames · ${backend}`,
    );
  }
  draw(context) {
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
