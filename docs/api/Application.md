# Application

`Application` is the normal ExoJS entrypoint.

## Responsibilities

- own the canvas
- own the backend/runtime manager
- own the input manager
- own the scene manager
- drive the frame lifecycle
- present the frame

## Default backend behavior

`new Application()` behaves as backend auto-selection:

- prefer WebGPU when available
- fall back to WebGL2 if WebGPU is unavailable or initialization fails

You can still force a backend explicitly:

```ts
new Application({ backend: { type: 'webgpu' } })
new Application({ backend: { type: 'webgl2' } })
new Application({ backend: { type: 'auto' } })
```

## Typical usage

```ts
import { Application } from 'exojs'

const app = new Application()
await app.start(scene)
```

## Important properties

- `canvas`
- `loader`
- `inputManager`
- `sceneManager`
- `renderManager`
- `onResize`

## Important methods

- `start(scene)`
- `stop()`
- `resize(width, height)`
- `destroy()`

`Application` owns frame presentation. Scene code should not call `display()` itself.
