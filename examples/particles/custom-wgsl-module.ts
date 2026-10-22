import { Application, Color, FixedResolutionCanvasSizing, type RenderingContext, Scene, type Seconds, Vector } from '@codexo/exojs';
import {
  Constant,
  type GlslContribution,
  type ParticleBatch,
  particlesExtension,
  ParticleSystem,
  RateSpawn,
  UpdateModule,
  type WgslContribution,
} from '@codexo/exojs/particles';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { mountControls } from '@examples/runtime';

/** Adds horizontal sway after integration, using the same operation on every backend. */
class SwayModule extends UpdateModule {
  amplitude: number;
  frequency: number;

  constructor(amplitude: number, frequency: number) {
    super();
    this.amplitude = amplitude;
    this.frequency = frequency;
  }

  override apply(particles: ParticleBatch, dt: number): void {
    const { x: velX } = particles.velocity;
    const { elapsed } = particles.timing;

    for (let i = 0; i < particles.count; i++) {
      velX[i] += Math.sin(elapsed[i] * this.frequency) * this.amplitude * dt;
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

  glsl(): GlslContribution {
    return {
      ...this.wgsl(),
      body: `velocity.x += sin(timing.x * u_SwayModule.frequency) * u_SwayModule.amplitude * dt;`,
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

  override init(): void {
    const app = this.app;
    const { width, height } = app;

    this.system = new ParticleSystem(this.loader.get(assets.particleLight), { capacity: 26000 });
    this.systems.add(this.system);
    this.system.setPosition(width / 2, height - 60);
    this.system.addSpawnModule(
      new RateSpawn({
        rate: new Constant(1800),
        lifetime: new Constant(2),
        velocity: new Constant(new Vector(0, -130)),
        scale: new Constant(new Vector(0.2, 0.2)),
      }),
    );
    this.system.addUpdateModule(new SwayModule(250, 8));

    // The simulation path (CPU, WebGL2 transform feedback or WebGPU compute)
    // is chosen on the first update, once the backend is known.
    this.hud = mountControls({ status: 'Simulation: detecting...' });
  }

  override update(_delta: Seconds): void {
    this.hud.setStatus(`Simulation: ${this.system.simulationBackend}`);
  }

  override draw(context: RenderingContext): void {
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
