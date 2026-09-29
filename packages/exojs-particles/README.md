# @codexo/exojs-particles

Particle emitters, modular simulation, and instanced rendering for ExoJS. Use the package for bounded visual effects rather than treating every particle as an independent gameplay object.

## Install and activate

```sh
npm install --save-exact @codexo/exojs @codexo/exojs-particles
```

Core is a peer dependency. Add `particlesExtension` to the application that renders the systems; importing the package has no global registration side effect.

## Minimal working example

```ts
import { Application, Color, type RenderingContext, Scene } from '@codexo/exojs';
import { ConeDirection, Constant, particlesExtension, ParticleSystem, RateSpawn } from '@codexo/exojs-particles';

class ParticleScene extends Scene {
  private particles!: ParticleSystem;

  override init(): void {
    this.particles = new ParticleSystem({ capacity: 512 });
    this.particles.setPosition(400, 300);
    this.particles.setScale(4);
    this.particles.addSpawnModule(
      new RateSpawn({
        rate: new Constant(40),
        lifetime: new Constant(2),
        velocity: new ConeDirection(-Math.PI / 2, Math.PI / 4, 10, 30),
      }),
    );
    this.systems.add(this.particles);
  }

  override draw(context: RenderingContext): void {
    context.render(this.particles);
  }
}

const app = new Application({
  scenes: { ParticleScene },
  extensions: [particlesExtension],
  canvas: { width: 800, height: 600, mount: 'body' },
  clearColor: Color.black,
});

await app.start(ParticleScene);
```

The no-texture constructor uses a white pixel. Particle positions and velocities are local to the system; scaling the system scales that local effect as well.

## Before choosing an execution path

WebGL2 quad particles use transform feedback; WebGPU uses compute for eligible modes. Every update module must provide the attached backend's shader implementation (`glsl()` or `wgsl()`). Otherwise the whole system uses CPU simulation. Inspect `simulationBackend` (`cpu`, `webgl2`, `webgpu`) after attachment and update; `gpuMode` is true for either GPU path. Use `{ simulation: 'cpu' }` to require CPU execution, including synchronous death callbacks.

The WebGL2 GPU path supports `QuadParticles`. Mesh remains CPU-simulated on WebGL2 and retains its existing WebGPU support. Ribbon and trail modes remain CPU-simulated. Insufficient WebGL2 vertex texture capacity selects CPU; shader compilation errors are reported rather than silently changing behavior.

Update modules may change while running. A change from GPU to CPU execution clears live particles because CPU storage does not contain the device's latest integrated state. Backend replacement or context/device loss also clears device-integrated particles. `clearParticles()` cancels pending death callbacks while retaining simulation allocations. Capacity is fixed at construction; choose it from rate, lifetime, bursts, and expected peak occupancy.

Particle colours are authored sRGB `Color` values. Gradient keyframes and the colour modules interpolate the authored components, identically on the CPU and both GPU paths, and each particle's colour is converted to linear light and premultiplied once in the render vertex stage. The particle texture is ordinary sRGB colour, and additive blending sums linear light; the sum is carried above display white only when the application uses `rendering.color.workingFormat: 'hdr'`.

A scene system registry advances and destroys a registered system. A system outside such an owner needs explicit cleanup. The texture has its own ownership, and a custom render mode passed to a system is owned by that system; do not share the same owned mode between independent systems.

Use `createParticlesExtension({ batchSize })` only when you need a deliberate renderer-batch configuration. Choose that descriptor instead of installing a second particle descriptor beside the default one.

## Custom modules and numerical parity

Implement `apply(particles, dt)` for CPU execution and explicit `wgsl()` / `glsl()` contributions for the GPU paths you support. Contributions share uniform fields and lookup texture declarations; `writeUniforms()` writes the same aligned little-endian bytes for both backends, and `textureData()` supplies backend-neutral lookup bytes. Module bodies run after integration, in registration order, including the final step before death. GPU contributions must treat elapsed and lifetime as read-only: the host owns expiry and slot reuse.

Built-in curve modules interpolate a shared 256-sample Float32 table; gradients interpolate a shared 256-sample RGBA8 table and round to the nearest byte. Narrow curve features can therefore be approximated. Tables are captured when the module program is compiled; clear and re-register modules after replacing lookup configuration. Uniform parameters can change each update. Turbulence uses an integer lattice hash shared by all implementations. Floating-point arithmetic still permits small backend differences; parity does not mean bit-identical trajectories.

Death records contain position, velocity, rotation, scale, color, elapsed and original lifetime after the terminal integration and module step. GPU delivery is asynchronous, ordered by submission and then slot, with three readback slots and a capacity-sized backlog. Overflow drops excess death callbacks and emits a development warning. Clear/destroy cancels pending delivery. Use CPU simulation for effects whose callbacks must run in the same update.

## Documentation

[Particles guide](https://exoridus.github.io/ExoJS/en/guide/effects/particles/) · [ParticleSystem API](https://exoridus.github.io/ExoJS/en/api/particle-system/) · [Emitter playground](https://exoridus.github.io/ExoJS/en/playground/?example=particles/emitter-basics)

## License

MIT
