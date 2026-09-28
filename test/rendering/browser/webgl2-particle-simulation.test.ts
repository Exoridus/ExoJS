/**
 * WebGL2 transform-feedback particle simulation: the per-update contract.
 *
 * The structural benchmark gate guards a total - `particles-lifecycle` records
 * 6 draw calls, 12 texture binds and 10 buffer uploads per frame against a
 * 1/0/1 baseline. That total is a useful tripwire but a poor specification: it
 * cannot distinguish one required simulation pass from two, and it says nothing
 * about which scene pays. This suite pins the contract the total is made of.
 *
 * What the implementation is entitled to do, and no more:
 * - one `update()` issues exactly ONE transform-feedback pass - one
 *   `beginTransformFeedback`, one `drawArrays`, one `endTransformFeedback`;
 * - a system that is never advanced issues none;
 * - an explicit `simulation: 'cpu'` never reaches the path at all.
 *
 * Counted by wrapping the live context's own methods, so the numbers describe
 * what the engine actually submitted rather than what it reported about itself.
 * A real context is required: the GPU state refuses to compile unless the driver
 * reports the interleaved components and vertex attributes transform feedback
 * needs, so this contract is not observable against a recording stub.
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { materializeRendererBindings } from '#extensions/materialize';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { AlphaFadeOverLifetime, Curve, particlesExtension, ParticleSystem, QuadParticles } from '../../../packages/exojs-particles/src/index';
import { wireCoreRenderers } from './_coreRenderers';

const canvasSize = 64;
const particleCount = 32;

const createBackend = async (): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const app = {
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width: canvasSize, height: canvasSize },
      rendering: {
        debug: false,
        webglAttributes: { antialias: false, preserveDrawingBuffer: true, stencil: false, depth: false },
        spriteRendererBatchSize: 1024,
        particleRendererBatchSize: 1024,
      },
    },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireCoreRenderers(backend, app.options.rendering);
  // The particle renderer is not part of the core bindings; the extension
  // materialises it. A bare backend built outside Application needs that wired
  // explicitly, same as `wireCoreRenderers` does for Sprite/Mesh/Text.
  materializeRendererBindings(backend, particlesExtension.renderers!);

  return backend;
};

const render = (backend: WebGl2Backend, node: RenderNode): void => {
  backend.clear();
  node.render(backend);
  backend.flush();
};

const createTexture = (): Texture => {
  const canvas = document.createElement('canvas');

  canvas.width = 16;
  canvas.height = 16;

  return new Texture(canvas);
};

/** A module that ships a GLSL form, which is part of what makes the system GPU-eligible. */
const fade = (): AlphaFadeOverLifetime =>
  new AlphaFadeOverLifetime(
    new Curve([
      { t: 0, v: 1 },
      { t: 1, v: 0 },
    ]),
  );

const makeSystem = (simulation?: 'cpu'): { root: Container; system: ParticleSystem } => {
  const system = new ParticleSystem(createTexture(), {
    capacity: particleCount,
    // GPU simulation is only eligible for the quad render mode, so it is named
    // rather than inherited: the default is not guaranteed to be it, and a
    // default that silently changed would turn this suite into a no-op.
    render: new QuadParticles(),
    ...(simulation === undefined ? {} : { simulation }),
  });
  const root = new Container();

  system.addUpdateModule(fade());

  for (let i = 0; i < particleCount; i++) {
    system.emit();
  }

  system.setPosition(canvasSize / 2, canvasSize / 2);
  root.addChild(system);

  return { root, system };
};

interface SimulationTally {
  begin: number;
  draw: number;
  end: number;
}

/** Count the transform-feedback calls on the backend's live context for the duration of `body`. */
const tallyTransformFeedback = (backend: WebGl2Backend, body: () => void): SimulationTally => {
  const gl = backend.context;
  const target = gl as unknown as Record<string, unknown>;
  const tally: SimulationTally = { begin: 0, draw: 0, end: 0 };
  const originals: Array<[string, unknown]> = [];

  const count = (name: string, field: keyof SimulationTally): void => {
    const original = target[name];

    originals.push([name, original]);
    target[name] = function counted(this: unknown, ...args: unknown[]): unknown {
      tally[field]++;

      return (original as (...fnArgs: unknown[]) => unknown).apply(this, args);
    };
  };

  count('beginTransformFeedback', 'begin');
  count('drawArrays', 'draw');
  count('endTransformFeedback', 'end');

  try {
    body();
  } finally {
    for (const [name, original] of originals) {
      target[name] = original;
    }
  }

  return tally;
};

test('one particle update issues exactly one transform-feedback simulation pass', async () => {
  const backend = await createBackend();
  const { root, system } = makeSystem();

  try {
    // One draw first: the system learns its backend from a render, and that is
    // also where the renderer is resolved.
    render(backend, root);

    const tally = tallyTransformFeedback(backend, () => {
      system.update((1 / 60) as never);
    });

    // Without this the pass could be absent because the system never reached the
    // GPU path, which would make the counts below vacuously correct.
    expect(system.gpuMode).toBe(true);
    expect(tally.begin).toBe(1);
    expect(tally.draw).toBe(1);
    expect(tally.end).toBe(1);
  } finally {
    root.destroy();
    backend.destroy();
  }
});

test('repeated updates issue one pass each, not one accumulated pass', async () => {
  const backend = await createBackend();
  const { root, system } = makeSystem();

  try {
    render(backend, root);
    system.update((1 / 60) as never);

    const tally = tallyTransformFeedback(backend, () => {
      system.update((1 / 60) as never);
      system.update((1 / 60) as never);
      system.update((1 / 60) as never);
    });

    expect(tally.begin).toBe(3);
    expect(tally.draw).toBe(3);
    expect(tally.end).toBe(3);
  } finally {
    root.destroy();
    backend.destroy();
  }
});

test('a system that is never advanced issues no simulation pass', async () => {
  const backend = await createBackend();
  const { root } = makeSystem();

  try {
    // This is the `particles-draw` archetype: it submits the same quads every
    // frame and simulates nothing, which is why it still measures 1/0/1.
    const tally = tallyTransformFeedback(backend, () => {
      render(backend, root);
      render(backend, root);
      render(backend, root);
    });

    expect(tally.begin).toBe(0);
    expect(tally.end).toBe(0);
  } finally {
    root.destroy();
    backend.destroy();
  }
});

test('an explicit cpu simulation never reaches the transform-feedback path', async () => {
  const backend = await createBackend();
  const { root, system } = makeSystem('cpu');

  try {
    render(backend, root);

    const tally = tallyTransformFeedback(backend, () => {
      system.update((1 / 60) as never);
    });

    expect(system.gpuMode).toBe(false);
    expect(tally.begin).toBe(0);
    expect(tally.end).toBe(0);
  } finally {
    root.destroy();
    backend.destroy();
  }
});
