// Auto-generated from custom-wgsl-module.ts - edit the .ts source, not this file.
import { Application, Color, FixedResolutionCanvasSizing, Scene, Vector } from '@codexo/exojs';
import { Constant, particlesExtension, ParticleSystem, RateSpawn, UpdateModule } from '@codexo/exojs-particles';
import { mountControls } from '@examples/runtime';
/** Adds horizontal sway after integration, using the same operation on every backend. */
class SwayModule extends UpdateModule {
  amplitude;
  frequency;
  constructor(amplitude, frequency) {
    super();
    this.amplitude = amplitude;
    this.frequency = frequency;
  }
  apply(particles, dt) {
    const { x: velX } = particles.velocity;
    const { elapsed } = particles.timing;
    for (let i = 0; i < particles.count; i++) {
      velX[i] += Math.sin(elapsed[i] * this.frequency) * this.amplitude * dt;
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
  glsl() {
    return {
      ...this.wgsl(),
      body: `velocity.x += sin(timing.x * u_SwayModule.frequency) * u_SwayModule.amplitude * dt;`,
    };
  }
  writeUniforms(view, offset) {
    view.setFloat32(offset + 0, this.amplitude, true);
    view.setFloat32(offset + 4, this.frequency, true);
  }
}
class CustomWgslModuleScene extends Scene {
  system;
  hud;
  init() {
    const app = this.app;
    const { width, height } = app;
    this.system = new ParticleSystem(this.loader.get(assets.demo.textures.particleLight), { capacity: 26000 });
    this.systems.add(this.system);
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
      title: 'Custom Particle Module',
      controls: [{ keys: 'Auto', action: 'CPU / WebGL2 transform feedback / WebGPU compute' }],
      // GPU vs CPU routing is decided on the first update() once the
      // backend is known - show "detecting" until then.
      status: 'Compute path: detecting…',
      hint: 'SwayModule provides apply(), glsl() and wgsl() with shared uniforms. Inspect the selected simulation path below.',
    });
  }
  update(_delta) {
    this.hud.setStatus(`Simulation: ${this.system.simulationBackend}`);
  }
  draw(context) {
    context.render(this.system);
  }
}
const app = new Application({
  scenes: { CustomWgslModuleScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
  extensions: [particlesExtension],
});
await app.start(CustomWgslModuleScene);
