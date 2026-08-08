/**
 * Restores the shipped GLSL for the core WebGL2 shaders.
 *
 * `shaderStubPlugin` rewrites every `.vert`/`.frag` import to an empty string,
 * and `WebGl2Backend#initialize` compiles the whole renderer registry eagerly —
 * so a spec touching any WebGL2 renderer needs valid sources for all of them,
 * not just the one it renders. `?raw` bypasses the stub (it only matches ids
 * ending in `.vert`/`.frag`), which keeps these mocks in lockstep with the
 * shipped shaders.
 *
 * This is wired as a **setup file** (`renderingBrowserSetupFiles` in
 * `vitest.config.ts`), not imported by the specs. vitest hoists `vi.mock` only
 * within the file holding the calls, so a helper module imported by a spec
 * would register its mocks after that spec's own imports had already pulled in
 * the renderers — too late. The calls must also stay at the top level with
 * factories that close over nothing, which is why there is no override
 * parameter: a spec needing a *probe* stage instead of the shipped one — a
 * fragment shader writing interpolated UVs out as colour, say — declares its
 * own `vi.mock` for that one path, which takes precedence over these.
 */

import { vi } from 'vitest';

vi.mock('#rendering/webgl2/glsl/backdrop-blend.frag', async () => ({
  default: (await import('../../../src/rendering/webgl2/glsl/backdrop-blend.frag?raw')).default,
}));
vi.mock('#rendering/webgl2/glsl/backdrop-blend.vert', async () => ({
  default: (await import('../../../src/rendering/webgl2/glsl/backdrop-blend.vert?raw')).default,
}));
vi.mock('#rendering/webgl2/glsl/mesh.frag', async () => ({ default: (await import('../../../src/rendering/webgl2/glsl/mesh.frag?raw')).default }));
vi.mock('#rendering/webgl2/glsl/mesh.vert', async () => ({ default: (await import('../../../src/rendering/webgl2/glsl/mesh.vert?raw')).default }));
vi.mock('#rendering/webgl2/glsl/sprite.frag', async () => ({ default: (await import('../../../src/rendering/webgl2/glsl/sprite.frag?raw')).default }));
vi.mock('#rendering/webgl2/glsl/sprite.vert', async () => ({ default: (await import('../../../src/rendering/webgl2/glsl/sprite.vert?raw')).default }));
vi.mock('#rendering/webgl2/glsl/stencil-clip.frag', async () => ({
  default: (await import('../../../src/rendering/webgl2/glsl/stencil-clip.frag?raw')).default,
}));
vi.mock('#rendering/webgl2/glsl/stencil-clip.vert', async () => ({
  default: (await import('../../../src/rendering/webgl2/glsl/stencil-clip.vert?raw')).default,
}));
vi.mock('#rendering/webgl2/glsl/text-color.frag', async () => ({ default: (await import('../../../src/rendering/webgl2/glsl/text-color.frag?raw')).default }));
vi.mock('#rendering/webgl2/glsl/text-msdf.frag', async () => ({ default: (await import('../../../src/rendering/webgl2/glsl/text-msdf.frag?raw')).default }));
vi.mock('#rendering/webgl2/glsl/text-sdf.frag', async () => ({ default: (await import('../../../src/rendering/webgl2/glsl/text-sdf.frag?raw')).default }));
vi.mock('#rendering/webgl2/glsl/text.vert', async () => ({ default: (await import('../../../src/rendering/webgl2/glsl/text.vert?raw')).default }));

// Extension-package shaders. The stub plugin blanks these the same way it
// blanks core ones, but they live outside `src/`, so they need their own
// entries — without them a particle scene compiles an empty vertex shader and
// draws nothing.
vi.mock('../../../packages/exojs-particles/src/renderers/glsl/particle.frag', async () => ({
  default: (await import('../../../packages/exojs-particles/src/renderers/glsl/particle.frag?raw')).default,
}));
vi.mock('../../../packages/exojs-particles/src/renderers/glsl/particle.vert', async () => ({
  default: (await import('../../../packages/exojs-particles/src/renderers/glsl/particle.vert?raw')).default,
}));
vi.mock('../../../packages/exojs-particles/src/renderModes/glsl/mesh.vert', async () => ({
  default: (await import('../../../packages/exojs-particles/src/renderModes/glsl/mesh.vert?raw')).default,
}));
vi.mock('../../../packages/exojs-particles/src/renderModes/glsl/ribbon.frag', async () => ({
  default: (await import('../../../packages/exojs-particles/src/renderModes/glsl/ribbon.frag?raw')).default,
}));
vi.mock('../../../packages/exojs-particles/src/renderModes/glsl/ribbon.vert', async () => ({
  default: (await import('../../../packages/exojs-particles/src/renderModes/glsl/ribbon.vert?raw')).default,
}));
