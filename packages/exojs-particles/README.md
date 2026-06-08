# @codexo/exojs-particles

Official ExoJS extension for GPU-accelerated particle systems.

## Installation

```sh
npm install @codexo/exojs @codexo/exojs-particles
```

This package requires `@codexo/exojs` as a peer dependency. Both must be the same version.

## Core compatibility

| `@codexo/exojs-particles` | `@codexo/exojs` |
|---|---|
| 0.12.x | 0.12.x |

## Usage — side-effect-free root entry

Import `ParticleSystem` and supply it explicitly to your Application via `extensions`:

```ts
import { Application } from '@codexo/exojs';
import { ParticleSystem, particlesExtension } from '@codexo/exojs-particles';

const app = new Application({
    extensions: [particlesExtension],
});
```

Importing from the root entry (`@codexo/exojs-particles`) does **not** register the extension globally. You control exactly which Applications receive the Particles extension.

## Extension descriptor

`particlesExtension` is the default descriptor. Use it when you want the default renderer batch size:

```ts
import { particlesExtension } from '@codexo/exojs-particles';

const app = new Application({ extensions: [particlesExtension] });
```

## Custom batch size via `createParticlesExtension`

```ts
import { createParticlesExtension } from '@codexo/exojs-particles';

const app = new Application({
    extensions: [createParticlesExtension({ batchSize: 8192 })],
});
```

## `ApplicationOptions.extensions`

Pass any combination of descriptors:

```ts
const app = new Application({
    extensions: [particlesExtension],
});
```

## `/register` convenience entry

Importing `/register` registers the default `particlesExtension` descriptor in the global `ExtensionRegistry`. Subsequently created Applications that use global defaults will automatically receive the Particles extension. This is the only side-effectful entry in this package.

```ts
// Side effect: registers particlesExtension in the global ExtensionRegistry.
import '@codexo/exojs-particles/register';

// All named exports are re-exported from /register:
import { ParticleSystem, particlesExtension } from '@codexo/exojs-particles/register';
```

**Note:** `/register` does not use automatic discovery. It explicitly calls `ExtensionRegistry.register(particlesExtension)` at module evaluation time.

## Minimal working example

```ts
import { Application, Scene, Texture } from '@codexo/exojs';
import {
    ParticleSystem,
    particlesExtension,
    RateSpawn,
    Constant,
} from '@codexo/exojs-particles';

const app = new Application({ extensions: [particlesExtension] });
document.body.append(app.canvas);

class DemoScene extends Scene {
    system!: ParticleSystem;

    override async load(loader) {
        await loader.load(Texture, { particle: '/particle.png' });
    }

    override create(loader) {
        this.system = new ParticleSystem(loader.get(Texture, 'particle'), {
            capacity: 1024,
        });
        this.system.addSpawnModule(
            new RateSpawn({ rate: new Constant(120), lifetime: new Constant(2) }),
        );
        this.addChild(this.system);
    }
}

app.scenes.start(DemoScene);
```

## WebGL2 and WebGPU support

- **WebGL2**: full instanced-draw renderer
- **WebGPU**: compute-shader GPU simulation when a WebGPU device is available; falls back to CPU simulation otherwise

## Destruction and ownership

`ParticleSystem` owns its GPU resources. Call `system.destroy()` when you are done with it. The `Application` or parent scene does not automatically destroy nested systems.

## Links

- [Official ExoJS Particles guide](https://exojs.dev/guides/extensions/particles)
- [API reference](https://exojs.dev/api/exojs-particles)

## License

MIT
