# @codexo/exojs-build

Build-time Vite and Rollup plugins that let you author shaders as real
`.vert`/`.frag`/`.wgsl` files, and AudioWorklet processors and Web Workers as
real TypeScript modules, then consume all of them as plain source strings.

No shader in a template literal. No hand-written JavaScript in one either. No
separate shader, worklet or worker asset. No extra request at runtime.

```bash
npm install --save-dev @codexo/exojs-build
```

This package is build-time tooling. Nothing it produces depends on it at
runtime, and ExoJS itself does not depend on it - keep it in
`devDependencies`.

## Setup

### Vite

```ts
import { defineConfig } from 'vite';

import { exojs } from '@codexo/exojs-build';

export default defineConfig(({ mode }) => ({
  plugins: [exojs({ minify: mode === 'production' })],
}));
```

### Rollup

```js
import { exojs } from '@codexo/exojs-build';

export default {
  input: 'src/main.js',
  output: { dir: 'dist', format: 'es' },
  plugins: [exojs()],
};
```

The `.ts` modules behind the import queries are bundled by esbuild, so Rollup
needs no TypeScript plugin for them.

### TypeScript

Add the published ambient declarations so the shader imports and the import
queries type-check:

```json
{
  "compilerOptions": {
    "types": ["@codexo/exojs-build/client"]
  }
}
```

## Shaders as files

ExoJS takes shader source as a `string` everywhere - `ShaderFilter`,
`ShaderSource`, `MeshMaterial`, `SpriteMaterial`, the WebGPU compute pipeline.
This plugin is what lets that string live in a real shader file, where an
editor's language service, a formatter and every shader-aware tool can reach
it.

```glsl
/* effect.frag */
#version 300 es

precision mediump float;

in vec2 vUv;
uniform float u_time;

out vec4 fragColor;

void main() {
  fragColor = vec4(vUv, abs(sin(u_time)), 1.0);
}
```

```ts
import { ShaderFilter } from '@codexo/exojs';

import fragment from './effect.frag';
import wgsl from './effect.wgsl';

const filter = new ShaderFilter({ glsl: { fragment }, wgsl, uniforms: { u_time: 0 } });
```

The text is inlined into the bundle, so nothing is fetched at runtime.

Only a bare import is claimed. `./effect.frag?raw`, `?url` and any other query
are left to the bundler, so Vite's asset handling keeps working next to this
plugin.

Under `minify` the emitted text loses its comments and layout whitespace and
nothing else - no identifier is renamed, no expression rewritten, no statement
reordered, and every line that still has content keeps its own line, which is
what keeps `#version` and the other preprocessor directives valid. This is not
a shader optimizer and there is deliberately no option that would make it one:
the driver already has one, and it is the only one that knows the target GPU.

## Typed AudioWorklet

```ts
// dsp.ts - an ordinary module
export const saturate = (sample: number, drive: number): number => Math.tanh(sample * drive) / Math.tanh(drive);
```

```ts
// saturator.worklet.ts - real TypeScript, with real imports
import { saturate } from './dsp';

class SaturatorProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];

    if (output) {
      for (let i = 0; i < output.length; i++) output[i] = saturate(input?.[i] ?? 0, 4);
    }

    return true;
  }
}

registerProcessor('saturator', SaturatorProcessor);
```

```ts
// main thread
import processorSource from './saturator.worklet.ts?worklet';

const url = URL.createObjectURL(new Blob([processorSource], { type: 'text/javascript' }));

try {
  await context.audioWorklet.addModule(url);
} finally {
  URL.revokeObjectURL(url);
}

const node = new AudioWorkletNode(context, 'saturator');
```

## Typed inline worker

```ts
// generator.worker.ts
import { fibonacci } from './shared';

self.onmessage = (event: MessageEvent<number>): void => {
  self.postMessage(fibonacci(event.data));
};
```

```ts
// main thread
import workerSource from './generator.worker.ts?worker';

const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
const worker = new Worker(url);
```

The emitted source is classic-script compatible, so a plain `new Worker(url)`
works and `{ type: 'module' }` is never required.

## API

| Export                  | Purpose                                            |
| ----------------------- | -------------------------------------------------- |
| `exojs(options?)`       | All three plugins at once. The normal entry point. |
| `createShaderPlugin()`  | Only the `.vert`/`.frag`/`.wgsl` loader.           |
| `createWorkletPlugin()` | Only the `?worklet` transform.                     |
| `createWorkerPlugin()`  | Only the `?worker` transform.                      |

All of them take `{ minify?: boolean }`, off by default so the inlined source
stays readable in dev servers and stack traces. There is no automatic
production detection: Rollup has no mode of its own, and inferring one would
make the same config behave differently in the two supported bundlers.

`@codexo/exojs-build/shader-strip` exports `stripShaderSource`, the exact
transform `minify` applies. Use it on shader text you build at runtime rather
than import from a file, so both halves ship on the same terms.

## What the transforms guarantee

- Shader files arrive as their own text, byte for byte, unless `minify` is on.
- TypeScript syntax and ordinary relative imports, to any depth.
- No `import` or `export` token in the emitted string - neither an
  `AudioWorkletGlobalScope` nor a classic worker can resolve one.
- One string per entry point, never a second emitted asset.
- Every file that contributed to a bundle is registered for watch-mode
  invalidation, so editing a shared helper reloads its worklet.
- Build errors name the offending source file.

## Notes

- Shaders are selected by extension, worklets and workers by import query. The
  query, not the filename, selects those two transforms: the same `.worklet.ts` or
  `.worker.ts` file can still be imported as an ordinary module - by a unit
  test, say - without going through the bundler.
- Worklet and worker code belongs to a global scope your app's program cannot
  select (`AudioWorkletGlobalScope`; `lib: webworker`). Give those files their
  own `tsconfig` rather than widening the app's.
- Creating a worker or worklet from a Blob URL needs `blob:` in the
  `script-src`/`worker-src` Content Security Policy directives.

## Licence

MIT
