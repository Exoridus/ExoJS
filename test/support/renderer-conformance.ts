/**
 * Renderer conformance kit: one reusable suite for the contract every
 * {@link RendererBinding} answers to, core or extension.
 *
 * The scenarios run the REAL {@link WebGl2Backend} and the real renderer against
 * the recording fake WebGL2 context under `test/perf/rendering`, so batching,
 * flush boundaries, GL object lifetime and bind order are the production ones -
 * only shader execution is absent. No browser, no GPU, deterministic.
 *
 * WebGPU has no Node double, so this covers the WebGL2 half of a binding; a
 * binding that declines WebGL2 registers a single scenario naming the reason.
 *
 * @internal Test support. Not shipped, not a public API.
 */
import { describe, expect, test } from 'vitest';

import type { RendererBinding } from '#extensions/Extension';
import { materializeRendererBindings } from '#extensions/materialize';
import { buildCoreRendererBindings } from '#rendering/coreRendererBindings';
import type { Drawable } from '#rendering/Drawable';
import { Mesh } from '#rendering/mesh/Mesh';
import { type RetainedBatchCapableRenderer, RetainedInstructionSet } from '#rendering/plan/RetainedInstructionSet';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import type { DrawableConstructor, Renderer } from '#rendering/Renderer';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import type { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { type GlEvent, GlEventLog } from '../perf/rendering/fakeWebGl2';
import { makeTexture } from '../perf/rendering/fixtures';
import { createWebGl2Harness, type WebGl2Harness } from '../perf/rendering/harness';

/** Options for {@link describeRendererConformance} / {@link runRendererConformance}. */
export interface RendererConformanceOptions {
  /**
   * Sample drawables, at least one instance per binding target, built fresh per
   * scenario against the backend the scenario runs on. Everything they hold
   * (textures, tile layers, particle systems) must be constructible under jsdom.
   */
  readonly drawables: (backend: WebGl2Backend) => readonly Drawable[];
  /**
   * How many draws the overflow scenario submits, cycling through the sample
   * drawables. Must exceed what the renderer fits in one batch, otherwise the
   * scenario cannot observe the flush it exists to check. Omit to skip it.
   */
  readonly overflowCount?: number;
  /**
   * Scene root the retained-capture scenario renders instead of submitting the
   * sample drawables directly.
   *
   * Needed only by a renderer whose recordable path requires a plan draw
   * command - the mesh renderer records its STATIC BATCH, which the plan
   * optimizer's group index selects, so a raw `backend.draw()` never reaches
   * it. The subtree must draw through the binding under test only.
   */
  readonly retainedScene?: (backend: WebGl2Backend) => RenderNode;
  /** Extra release assertion, run after the renderer has been disconnected and destroyed. */
  readonly expectReleased?: () => void;
}

/** A renderer that may expose the optional final teardown hook. */
type MaybeDestroyable = Renderer<RenderBackend, Drawable> & { destroy?: () => void };

/** What `create` answered for a WebGL2 backend, taken once per suite. */
type BindingSupport =
  | { readonly kind: 'supported'; readonly retained: boolean }
  | { readonly kind: 'declined'; readonly reason: string }
  | { readonly kind: 'threw'; readonly error: unknown };

/** A backend with an empty renderer registry, plus the ordered GL trace. */
interface ConformanceHarness extends WebGl2Harness {
  readonly log: GlEventLog;
}

const createConformanceHarness = (): ConformanceHarness => {
  // An empty registry, not the core one: a suite over a core binding
  // materialises that binding itself, and binding a target twice throws.
  const harness = createWebGl2Harness({ coreRenderers: false });
  const log = new GlEventLog();

  harness.recorder.log = log;

  return { ...harness, log };
};

/** Counters for the lifecycle calls the registry makes on a bound renderer. */
interface BindingInstrumentation {
  binding: RendererBinding;
  /** Every renderer `create` answered, in creation order. */
  readonly renderers: MaybeDestroyable[];
  connectCalls: number;
  disconnectCalls: number;
}

/**
 * Wrap `binding` so the suite observes what the registry does to the renderer it
 * produces. The counters are installed as own properties before `create`
 * returns, so the `connect` the registry issues from `bindRenderer` is counted.
 */
const instrument = (binding: RendererBinding): BindingInstrumentation => {
  const state: BindingInstrumentation = {
    binding: null as unknown as RendererBinding,
    renderers: [],
    connectCalls: 0,
    disconnectCalls: 0,
  };

  state.binding = {
    targets: binding.targets,
    create(backend: RenderBackend) {
      const renderer = binding.create(backend) as MaybeDestroyable | undefined;

      if (renderer === undefined) {
        return undefined;
      }

      const connect = renderer.connect.bind(renderer);
      const disconnect = renderer.disconnect.bind(renderer);

      Object.assign(renderer, {
        connect: (target: RenderBackend): void => {
          state.connectCalls++;
          connect(target);
        },
        disconnect: (): void => {
          state.disconnectCalls++;
          disconnect();
        },
      });

      state.renderers.push(renderer);

      return renderer;
    },
  };

  return state;
};

/** One scenario's world: an empty-registry backend with the binding under test materialised. */
interface ConformanceRun {
  readonly harness: ConformanceHarness;
  readonly backend: WebGl2Backend;
  readonly log: GlEventLog;
  readonly renderer: MaybeDestroyable;
  readonly drawables: readonly Drawable[];
  readonly state: BindingInstrumentation;
}

const withRun = (binding: RendererBinding, options: RendererConformanceOptions, body: (run: ConformanceRun) => void): void => {
  const harness = createConformanceHarness();

  try {
    const state = instrument(binding);

    materializeRendererBindings(harness.backend, [state.binding]);

    const renderer = state.renderers[0];

    expect(renderer, 'create() must answer a renderer for the WebGL2 backend').toBeDefined();

    body({
      harness,
      backend: harness.backend,
      log: harness.log,
      renderer: renderer as MaybeDestroyable,
      drawables: options.drawables(harness.backend),
      state,
    });
  } finally {
    harness.destroy();
  }
};

/** Submit `drawables` through the backend and flush, from a zeroed stats/recorder state. */
const drawFrame = (harness: ConformanceHarness, drawables: readonly Drawable[]): void => {
  harness.backend.resetStats();
  harness.recorder.reset();

  for (const drawable of drawables) {
    harness.backend.draw(drawable);
  }

  harness.backend.flush();
};

const isCreateEvent = (event: GlEvent): boolean => event.op.startsWith('create:');

/** Handles the trace deleted at any point, whatever their kind. */
const deletedHandles = (log: GlEventLog): Set<object> => {
  const handles = new Set<object>();

  for (const event of log.events) {
    if (event.op.startsWith('delete:') && event.handle !== null) {
      handles.add(event.handle);
    }
  }

  return handles;
};

/** Objects created in `log.events[from..to)`. */
const createdBetween = (log: GlEventLog, from: number, to: number): GlEvent[] => log.events.slice(from, to).filter(isCreateEvent);

/**
 * GL object classes a renderer owns outright. Textures, framebuffers and
 * renderbuffers are excluded: a texture belongs to the image or render target it
 * backs, whose lifetime is not the renderer's.
 */
const rendererOwnedKinds: ReadonlySet<string> = new Set(['create:buffer', 'create:vertexArray', 'create:program', 'create:shader']);

const isRendererOwned = (event: GlEvent): boolean => rendererOwnedKinds.has(event.op);

/** A drawable and the core binding that renders it, for the state-ownership scenario. */
interface ForeignFixture {
  readonly binding: RendererBinding;
  readonly createDrawable: () => Drawable;
}

/**
 * A core renderer to contend for GL state with the one under test. Sprite by
 * default; Mesh when the binding under test already owns Sprite, since two
 * bindings cannot claim the same target.
 */
const foreignFixtureFor = (binding: RendererBinding): ForeignFixture => {
  const core = buildCoreRendererBindings({});
  const owns = (target: DrawableConstructor): boolean => binding.targets.includes(target as DrawableConstructor<Drawable>);
  const bindingFor = (target: DrawableConstructor): RendererBinding =>
    core.find(candidate => candidate.targets.includes(target as DrawableConstructor<Drawable>))!;

  if (!owns(Sprite)) {
    return { binding: bindingFor(Sprite), createDrawable: (): Drawable => new Sprite(makeTexture()) };
  }

  return {
    binding: bindingFor(Mesh),
    createDrawable: (): Drawable =>
      new Mesh({
        vertices: new Float32Array([0, 0, 64, 0, 64, 64, 0, 64]),
        indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
        uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
        texture: makeTexture(),
      }),
  };
};

/** Ask `create` once, off to the side, so the suite knows which scenarios apply. */
const probeSupport = (binding: RendererBinding): BindingSupport => {
  const harness = createConformanceHarness();

  try {
    const renderer = binding.create(harness.backend);

    if (renderer === undefined) {
      return { kind: 'declined', reason: 'create() answered undefined for a WebGL2 backend' };
    }

    if (renderer.backendType !== RenderBackendType.WebGl2) {
      return { kind: 'declined', reason: `create() answered a renderer whose backendType is ${String(renderer.backendType)}` };
    }

    return { kind: 'supported', retained: (renderer as RetainedBatchCapableRenderer)._supportsRetainedBatches === true };
  } catch (error: unknown) {
    return { kind: 'threw', error };
  } finally {
    harness.destroy();
  }
};

/**
 * Run the renderer conformance suite for `binding` inside the caller's own
 * `describe` block.
 *
 * The scenarios are the contract `AbstractWebGl2Renderer`, `RendererRegistry`,
 * `materializeRendererBindings` and the retained-batch hooks state, and that
 * nothing else enforces per renderer:
 *
 * - the binding declares a usable target list and hands every backend its own
 *   renderer instance, never a shared one;
 * - materialising it resolves every target to that one instance, connected once;
 * - connect is idempotent, disconnect is repeatable and reversible, and a
 *   renderer that was never connected draws nothing;
 * - a flushed frame issues draws and books exactly those draws in `RenderStats`,
 *   while a redundant flush issues none;
 * - a batch that overruns its capacity flushes and keeps going, dropping nothing;
 * - the renderer re-establishes its own program and vertex array after a foreign
 *   renderer has owned the GL state, as `AbstractWebGl2Renderer` requires;
 * - what it acquired on connect is released again on teardown;
 * - its retained-recording answers are stable per drawable, and a frame drawn
 *   inside a capture window records a replayable batch.
 *
 * `binding` must be a stateless factory - the scenarios materialise it on
 * several backends.
 */
export const runRendererConformance = (binding: RendererBinding, options: RendererConformanceOptions): void => {
  const support = probeSupport(binding);

  if (support.kind === 'threw') {
    test('create() answers a renderer or undefined for a WebGL2 backend', () => {
      throw support.error;
    });

    return;
  }

  if (support.kind === 'declined') {
    // A binding with no WebGL2 renderer is conformant; the rest of the suite
    // has nothing to run against. Asserted rather than skipped, so a binding
    // that silently loses its WebGL2 renderer is a failure here, not a quiet
    // suite that stopped covering it.
    test(`declines the WebGL2 backend: ${support.reason}`, () => {
      const harness = createConformanceHarness();

      try {
        expect(
          binding.create(harness.backend)?.backendType,
          'a binding that declines WebGL2 must keep declining it - the registry binds whatever it answers',
        ).not.toBe(RenderBackendType.WebGl2);
      } finally {
        harness.destroy();
      }
    });

    return;
  }

  test('declares a non-empty, duplicate-free target list', () => {
    const targets = binding.targets;

    expect(targets.length, 'a RendererBinding must declare at least one target').toBeGreaterThan(0);
    expect(new Set(targets).size, 'a RendererBinding must not declare the same target twice - the registry rejects it').toBe(targets.length);
  });

  test('answers a fresh WebGL2 renderer per backend, never a shared instance', () => {
    const harness = createConformanceHarness();
    const other = createConformanceHarness();

    try {
      const first = binding.create(harness.backend);
      const second = binding.create(other.backend);

      expect(first, 'create() must answer a renderer for a WebGL2 backend').toBeDefined();
      expect(first!.backendType, 'a renderer created for a WebGL2 backend must report backendType WebGl2').toBe(RenderBackendType.WebGl2);
      expect(second, 'create() must answer a renderer for a WebGL2 backend').toBeDefined();
      expect(second, 'each backend gets its own renderer instance - backends never share one').not.toBe(first);
    } finally {
      other.destroy();
      harness.destroy();
    }
  });

  test('never answers the WebGL2 renderer for a WebGPU backend', () => {
    // Only `backendType` is read on this path, and refusing an unsupported
    // backend by throwing is conformant too - what a binding must never do is
    // hand a WebGPU backend the WebGL2 renderer.
    const webGpuBackend = { backendType: RenderBackendType.WebGpu } as unknown as RenderBackend;

    let renderer: Renderer<RenderBackend, Drawable> | undefined;

    try {
      renderer = binding.create(webGpuBackend);
    } catch {
      return;
    }

    if (renderer === undefined) {
      return;
    }

    expect(renderer.backendType, 'a binding must answer undefined, throw, or answer a WebGPU renderer for a WebGPU backend - never the WebGL2 one').toBe(
      RenderBackendType.WebGpu,
    );
  });

  test('materialising the binding resolves every target to the one renderer, connected once', () => {
    withRun(binding, options, run => {
      for (const drawable of run.drawables) {
        expect(run.backend.rendererRegistry.resolve(drawable), `${drawable.constructor.name} must resolve to the renderer its binding created`).toBe(
          run.renderer,
        );
      }

      expect(run.state.connectCalls, 'a binding connects its renderer exactly once, however many targets it declares').toBe(1);

      run.backend.rendererRegistry.disconnect();

      expect(run.state.disconnectCalls, 'the registry deduplicates by instance, so a multi-target binding disconnects its renderer exactly once').toBe(1);
    });
  });

  test('a second connect() acquires no further GL objects', () => {
    withRun(binding, options, run => {
      drawFrame(run.harness, run.drawables);

      const mark = run.log.events.length;

      run.renderer.connect(run.backend);

      expect(
        createdBetween(run.log, mark, run.log.events.length),
        'connect() on an already connected renderer must be a no-op, not a second acquisition',
      ).toEqual([]);
    });
  });

  test('disconnect() is repeatable and reversible', () => {
    withRun(binding, options, run => {
      drawFrame(run.harness, run.drawables);

      expect(() => run.renderer.disconnect(), 'disconnect() must release once and tolerate being called again').not.toThrow();
      expect(() => run.renderer.disconnect(), 'a second disconnect() must be harmless, not a double free').not.toThrow();

      run.renderer.connect(run.backend);
      drawFrame(run.harness, run.drawables);

      expect(
        run.harness.recorder.drawCalls,
        'a renderer reconnected after disconnect must draw again - disconnect is reversible, destroy is final',
      ).toBeGreaterThan(0);
    });
  });

  test('a renderer that was never connected draws nothing', () => {
    const harness = createConformanceHarness();

    try {
      const renderer = binding.create(harness.backend) as MaybeDestroyable;
      const drawables = options.drawables(harness.backend);

      harness.recorder.reset();

      try {
        for (const drawable of drawables) {
          renderer.render(drawable);
        }

        renderer.flush();
      } catch {
        // Refusing to render without a backend is the other conformant answer.
        return;
      }

      expect(harness.recorder.drawCalls, 'render()/flush() before connect() must throw or draw nothing - never issue GL work against no backend').toBe(0);
    } finally {
      harness.destroy();
    }
  });

  test('destroy() after disconnect is safe, and safe again', () => {
    const harness = createConformanceHarness();

    try {
      const renderer = binding.create(harness.backend) as MaybeDestroyable;
      const destroy = renderer.destroy;

      renderer.connect(harness.backend);
      renderer.disconnect();

      if (destroy === undefined) {
        return;
      }

      expect(() => destroy.call(renderer), 'destroy() after disconnect must release the rest, not fail on already released state').not.toThrow();
      expect(() => destroy.call(renderer), 'destroy() must be idempotent - release once and null the handles').not.toThrow();
    } finally {
      harness.destroy();
    }
  });

  test('a flushed frame draws, and books exactly those draws in RenderStats', () => {
    withRun(binding, options, run => {
      drawFrame(run.harness, run.drawables);

      expect(run.harness.recorder.drawCalls, 'rendering every sample drawable and flushing must issue at least one GPU draw').toBeGreaterThan(0);
      expect(run.backend.stats.drawCalls, 'a renderer owns its stats increments: stats.drawCalls must match the draws it actually issued').toBe(
        run.harness.recorder.drawCalls,
      );
      expect(run.backend.stats.submittedNodes, 'every submitted drawable must reach the renderer').toBe(run.drawables.length);
    });
  });

  test('a redundant flush() issues nothing', () => {
    withRun(binding, options, run => {
      drawFrame(run.harness, run.drawables);

      run.harness.recorder.reset();
      run.backend.flush();

      expect(run.harness.recorder.drawCalls, 'flush() on a drained batch must issue no draw - a batch is submitted once').toBe(0);

      run.harness.recorder.reset();
      run.backend.flush();

      expect(run.harness.recorder.drawCalls, 'flush() with nothing rendered must issue no draw').toBe(0);
    });
  });

  const overflowCount = options.overflowCount;

  if (overflowCount !== undefined) {
    test(`${overflowCount} draws overrun the batch, flush more than once, and drop nothing`, () => {
      withRun(binding, options, run => {
        const cycled: Drawable[] = [];

        for (let index = 0; index < overflowCount; index++) {
          cycled.push(run.drawables[index % run.drawables.length]!);
        }

        drawFrame(run.harness, cycled);

        expect(
          run.harness.recorder.drawCalls,
          'a batch that fills up must flush and keep accumulating, so an overrun frame issues more than one draw',
        ).toBeGreaterThan(1);
        expect(run.backend.stats.submittedNodes, 'an overrun must not drop the surplus drawables').toBe(overflowCount);
        expect(run.backend.stats.drawCalls, 'the intermediate flushes must be booked in stats too').toBe(run.harness.recorder.drawCalls);
      });
    });
  }

  test('re-establishes its own program and vertex array after a foreign renderer drew', () => {
    const harness = createConformanceHarness();

    try {
      const foreign = foreignFixtureFor(binding);

      materializeRendererBindings(harness.backend, [foreign.binding]);

      const foreignDrawable = foreign.createDrawable();

      drawFrame(harness, [foreignDrawable]);

      const foreignPrograms = new Set(harness.log.created('program'));
      const foreignVaos = new Set(harness.log.created('vertexArray'));
      const state = instrument(binding);

      materializeRendererBindings(harness.backend, [state.binding]);

      const drawables = options.drawables(harness.backend);

      // Warm-up frame: a renderer that compiles its program or wires its vertex
      // array on first use creates them here, while nothing else draws, so the
      // handles left over against the foreign sets are its own.
      drawFrame(harness, drawables);

      const ownPrograms = harness.log.created('program').filter(handle => !foreignPrograms.has(handle));
      const ownVaos = harness.log.created('vertexArray').filter(handle => !foreignVaos.has(handle));

      drawFrame(harness, [foreignDrawable]);
      harness.log.reset();
      drawFrame(harness, drawables);

      const firstDraw = harness.log.events.findIndex(event => event.op === 'draw');

      expect(firstDraw, 'the renderer under test must issue a draw for its own drawables').toBeGreaterThanOrEqual(0);

      const preamble = harness.log.events.slice(0, firstDraw);
      const bound = (op: GlEvent['op'], own: readonly object[]): boolean =>
        preamble.some(event => event.op === op && event.handle !== null && own.includes(event.handle));

      expect(
        bound('useProgram', ownPrograms),
        'GL state is global: a renderer must bind its own program immediately before its draw, because another renderer may have changed it since the batch opened',
      ).toBe(true);
      expect(
        bound('bindVertexArray', ownVaos),
        'GL state is global: a renderer must bind its own vertex array immediately before its draw, because another renderer may have changed it since the batch opened',
      ).toBe(true);
    } finally {
      harness.destroy();
    }
  });

  test('returns its GPU bytes to the accountant when it disconnects', () => {
    const harness = createConformanceHarness();

    try {
      // A bare connect/disconnect cycle, with no frame in between: what a
      // rendered frame adds to the tally is the backend's own transform and
      // tint storage, which outlives any single renderer.
      const renderer = binding.create(harness.backend) as MaybeDestroyable;
      const beforeConnect = harness.backend.stats.gpuMemoryBytes;

      renderer.connect(harness.backend);
      renderer.disconnect();

      expect(harness.backend.stats.gpuMemoryBytes, 'the GPU byte accountant must return to its pre-connect total once the renderer disconnected').toBe(
        beforeConnect,
      );
    } finally {
      harness.destroy();
    }
  });

  test('releases every GL object it allocated', () => {
    const harness = createConformanceHarness();

    try {
      const state = instrument(binding);
      const mark = harness.log.events.length;

      materializeRendererBindings(harness.backend, [state.binding]);

      const renderer = state.renderers[0] as MaybeDestroyable;

      // One frame first: a renderer that compiles its program or allocates its
      // buffers on first use acquires them here rather than in connect(), and
      // those are its to release too.
      drawFrame(harness, options.drawables(harness.backend));

      const acquired = createdBetween(harness.log, mark, harness.log.events.length).filter(isRendererOwned);

      renderer.disconnect();

      const deletedByDisconnect = deletedHandles(harness.log);
      // Buffers and vertex arrays only at this point: disconnect is reversible,
      // so a renderer may legitimately hold its compiled program until destroy().
      const stillHeld = acquired.filter(
        event => (event.op === 'create:buffer' || event.op === 'create:vertexArray') && event.handle !== null && !deletedByDisconnect.has(event.handle),
      );

      expect(
        stillHeld.map(event => event.op),
        'disconnect() must delete the buffers and vertex arrays the renderer allocated',
      ).toEqual([]);

      renderer.destroy?.();

      const deletedByDestroy = deletedHandles(harness.log);
      const leaked = acquired.filter(event => event.handle !== null && !deletedByDestroy.has(event.handle));

      expect(
        leaked.map(event => event.op),
        'every GL object the renderer allocated must be gone once it is disconnected and destroyed',
      ).toEqual([]);

      options.expectReleased?.();
    } finally {
      harness.destroy();
    }
  });

  if (!support.retained) {
    return;
  }

  test('answers the same retained-recording verdict for the same drawable twice', () => {
    withRun(binding, options, run => {
      const renderer = run.renderer as RetainedBatchCapableRenderer;

      for (const drawable of run.drawables) {
        const admits = renderer._admitsRetainedRecording?.(drawable);

        expect(
          renderer._admitsRetainedRecording?.(drawable),
          `_admitsRetainedRecording is cached per capture, so it must answer the same for ${drawable.constructor.name} until the capture is re-keyed`,
        ).toBe(admits);

        const records = renderer._canRecordRetainedDrawable?.(drawable);

        expect(
          renderer._canRecordRetainedDrawable?.(drawable),
          `_canRecordRetainedDrawable is cached per capture, so it must answer the same for ${drawable.constructor.name} until the capture is re-keyed`,
        ).toBe(records);
      }
    });
  });

  test('records a replayable batch for a frame drawn inside a capture window', () => {
    withRun(binding, options, run => {
      const renderer = run.renderer as RetainedBatchCapableRenderer;
      const scene = options.retainedScene?.(run.backend);
      const recordable = run.drawables.filter(drawable => renderer._admitsRetainedRecording?.(drawable) !== false);
      const submit = (): void => {
        if (scene !== undefined) {
          scene.render(run.backend);

          return;
        }

        for (const drawable of recordable) {
          run.backend.draw(drawable);
        }
      };

      if (scene === undefined) {
        expect(recordable.length, 'a renderer declaring _supportsRetainedBatches must admit at least one of its own sample drawables').toBeGreaterThan(0);
      }

      // Warm the renderer first: the capture window records flushes, and a
      // first-use compile or buffer growth inside it would be recorded as part
      // of the batch rather than as setup.
      run.backend.resetStats();
      run.harness.recorder.reset();
      submit();
      run.backend.flush();

      const set = new RetainedInstructionSet();

      run.backend.resetStats();
      run.harness.recorder.reset();
      set.beginRecording(run.backend);
      run.backend._beginRetainedCapture(set);
      submit();
      run.backend.flush();
      run.backend._endRetainedCapture(set);
      set.commitRecording();

      const batches = set.instructions.filter(instruction => 'bundle' in instruction);

      expect(
        batches.length,
        'a renderer declaring _supportsRetainedBatches must hand its flush to recordRetainedBatch while a capture window is open',
      ).toBeGreaterThan(0);
      expect(set.isValidFor(run.backend), 'a committed recording must validate against the backend it was recorded on').toBe(true);
    });
  });
};

/**
 * {@link runRendererConformance} wrapped in its own `describe` block. The usual
 * entry point; call `runRendererConformance` directly only to nest the scenarios
 * inside a block a spec already owns.
 */
export const describeRendererConformance = (name: string, binding: RendererBinding, options: RendererConformanceOptions): void => {
  describe(`${name} renderer conformance`, () => {
    runRendererConformance(binding, options);
  });
};
