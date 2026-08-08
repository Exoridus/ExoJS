/**
 * Restores the shipped GLSL for the `@codexo/exojs-particles` shaders in the
 * jsdom projects.
 *
 * `shaderStubPlugin` rewrites every `.vert`/`.frag` import to an empty string,
 * and `ShaderSource` rejects empty GLSL — so a spec that merely reaches a
 * particle render mode's `Material` throws, even when it draws through the
 * WebGPU backend and never looks at the GLSL at all. `?raw` bypasses the stub
 * (it only matches ids ending in `.vert`/`.frag`), which keeps these mocks in
 * lockstep with the shipped shaders.
 *
 * Wired as a **setup file** for the same reason as the browser counterpart
 * (`browser/_glslMocks.ts`): vitest hoists `vi.mock` only within the file
 * holding the calls, so a helper module imported by a spec would register its
 * mocks after that spec's own imports had already pulled in the renderers.
 */

import { vi } from 'vitest';

vi.mock('../../packages/exojs-particles/src/renderers/glsl/particle.frag', async () => ({
  default: (await import('../../packages/exojs-particles/src/renderers/glsl/particle.frag?raw')).default,
}));
vi.mock('../../packages/exojs-particles/src/renderers/glsl/particle.vert', async () => ({
  default: (await import('../../packages/exojs-particles/src/renderers/glsl/particle.vert?raw')).default,
}));
