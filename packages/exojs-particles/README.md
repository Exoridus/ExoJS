# @codexo/exojs-particles

Particle emitters, modular simulation, and instanced rendering for ExoJS. Use the package for bounded visual effects rather than treating every particle as an independent gameplay object.

## Install and activate

```sh
npm install --save-exact @codexo/exojs @codexo/exojs-particles
```

Core is a peer dependency. Add `particlesExtension` to the application that renders the systems; importing the package has no global registration side effect.

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

WebGL2 uses CPU simulation. WebGPU can use compute when the attached backend, update modules, and render mode are eligible. Inspect `gpuMode` after attachment and update rather than inferring it from the browser name.

Update modules may change while running. A change from GPU to CPU execution clears live particles because CPU storage does not contain the device's latest integrated state. Capacity is fixed at construction; choose it from rate, lifetime, bursts, and expected peak occupancy.

A scene system registry advances and destroys a registered system. A system outside such an owner needs explicit cleanup. The texture has its own ownership, and a custom render mode passed to a system is owned by that system; do not share the same owned mode between independent systems.

Use `createParticlesExtension({ batchSize })` only when you need a deliberate renderer-batch configuration. Choose that descriptor instead of installing a second particle descriptor beside the default one.

## Documentation

[Particles guide](https://exoridus.github.io/ExoJS/en/guide/effects/particles/) · [ParticleSystem API](https://exoridus.github.io/ExoJS/en/api/particle-system/) · [Emitter playground](https://exoridus.github.io/ExoJS/en/playground/?example=particles/emitter-basics)

## License

MIT
