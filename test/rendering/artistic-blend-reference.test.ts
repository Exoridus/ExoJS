/**
 * Independent numerical oracle for the backdrop-aware compositor's artistic
 * blend modes (Multiply, Screen, Darken..Luminosity - the modes
 * `WebGl2BackdropBlendCompositor`/`WebGpuBackdropBlendCompositor` evaluate in
 * shader). Derived straight from the W3C Compositing & Blending general
 * formula for "source-over with a blend function":
 *
 *   Co = (1-as)*ab*Cb + (1-ab)*as*Cs + as*ab*B(Cb, Cs)
 *   Ao = as + ab*(1-as)
 *
 * with straight (un-premultiplied) `Cb`/`Cs` in [0, 1] and `B` the mode's W3C
 * blend function evaluated on colour CLAMPED to [0, 1] - these are bounded
 * grading operations, not a transparent HDR transport. This is algebraically
 * equivalent to the shaders' own decomposition (blend the source against the
 * backdrop, premultiply by source alpha, let the GPU source-over composite
 * the result), but is derived independently here rather than copied from
 * shader code, so agreement is a real cross-check.
 *
 * `w3cBlend`/`ADVANCED_BLEND_MODES` are reused from the browser suite's own
 * reference (same W3C per-mode formulas) rather than re-typed a third time;
 * only the compositing formula around them - the part under test
 * fractional destination-alpha coverage for - is independent here.
 */
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { Filter } from '#rendering/filters/Filter';
import { RenderEntryKind } from '#rendering/plan/renderCommand';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RenderPlanOptimizer } from '#rendering/plan/RenderPlanOptimizer';
import { RenderPlanPlayer } from '#rendering/plan/RenderPlanPlayer';
import type { GroupScope, ScopeEntry } from '#rendering/plan/RenderScope';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderNode } from '#rendering/RenderNode';
import { RenderTarget } from '#rendering/RenderTarget';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { blendModeNeedsBackdrop, BlendModes } from '#rendering/types';

import { createRenderBackendDouble } from '../support/render-backend-double';
import { ADVANCED_BLEND_MODES, type Rgb, w3cBlend } from './browser/_blendReference';

interface Sample {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const clampRgb = (rgb: Rgb): Rgb => [clamp01(rgb[0]), clamp01(rgb[1]), clamp01(rgb[2])];

/** Co/Ao per the W3C general compositing-with-blend formula, straight [0,1] inputs/output. */
const compositeOverBackdrop = (mode: BlendModes, src: Sample, dst: Sample): Sample => {
  const cb: Rgb = [dst.r, dst.g, dst.b];
  const cs: Rgb = [src.r, src.g, src.b];
  const blended = w3cBlend(mode, clampRgb(cb), clampRgb(cs));
  const as = src.a;
  const ab = dst.a;

  const co = (channel: 0 | 1 | 2): number => (1 - as) * ab * cb[channel] + (1 - ab) * as * cs[channel] + as * ab * blended[channel];

  return { r: co(0), g: co(1), b: co(2), a: as + ab * (1 - as) };
};

const modeName = (mode: BlendModes): string => BlendModes[mode]!;

describe('backdrop-aware compositor artistic blend reference (D4)', () => {
  describe.each(ADVANCED_BLEND_MODES)('%s', mode => {
    test('opaque destination reduces to the raw W3C blend result', () => {
      const src: Sample = { r: 0.9, g: 0.3, b: 0.1, a: 1 };
      const dst: Sample = { r: 0.2, g: 0.6, b: 0.8, a: 1 };
      const result = compositeOverBackdrop(mode, src, dst);
      const raw = w3cBlend(mode, [dst.r, dst.g, dst.b], [src.r, src.g, src.b]);

      expect(result.r, `${modeName(mode)} r`).toBeCloseTo(raw[0], 10);
      expect(result.g, `${modeName(mode)} g`).toBeCloseTo(raw[1], 10);
      expect(result.b, `${modeName(mode)} b`).toBeCloseTo(raw[2], 10);
      expect(result.a).toBeCloseTo(1, 10);
    });

    test('transparent destination leaves the source untouched (no backdrop to blend with)', () => {
      const src: Sample = { r: 0.7, g: 0.4, b: 0.2, a: 0.65 };
      const dst: Sample = { r: 0.5, g: 0.5, b: 0.5, a: 0 };
      const result = compositeOverBackdrop(mode, src, dst);

      expect(result.r).toBeCloseTo(src.r * src.a, 10);
      expect(result.g).toBeCloseTo(src.g * src.a, 10);
      expect(result.b).toBeCloseTo(src.b * src.a, 10);
      expect(result.a).toBeCloseTo(src.a, 10);
    });

    test('fractional destination alpha blends only the covered fraction of the backdrop', () => {
      const src: Sample = { r: 0.3, g: 0.8, b: 0.5, a: 0.9 };
      const dst: Sample = { r: 0.6, g: 0.1, b: 0.2, a: 0.4 };
      const result = compositeOverBackdrop(mode, src, dst);
      const raw = w3cBlend(mode, [dst.r, dst.g, dst.b], [src.r, src.g, src.b]);
      const mixedSource: Rgb = [src.r + (raw[0] - src.r) * dst.a, src.g + (raw[1] - src.g) * dst.a, src.b + (raw[2] - src.b) * dst.a];
      // What the shader itself outputs (premultiplied by source alpha only);
      // the GPU's own normal source-over blend then adds the untouched
      // backdrop's contribution, (1-as)*ab*Cb, on top - the shader never
      // computes that part itself.
      const shaderPremultiplied: Rgb = [mixedSource[0] * src.a, mixedSource[1] * src.a, mixedSource[2] * src.a];
      const gpuSourceOver = (channel: 0 | 1 | 2, cb: number): number => shaderPremultiplied[channel] + (1 - src.a) * dst.a * cb;

      // Cross-check against the shaders' own decomposition plus the GPU's
      // normal-blend compositing step, to confirm the two equivalent
      // derivations agree, not just that each is internally consistent.
      expect(result.r).toBeCloseTo(gpuSourceOver(0, dst.r), 10);
      expect(result.g).toBeCloseTo(gpuSourceOver(1, dst.g), 10);
      expect(result.b).toBeCloseTo(gpuSourceOver(2, dst.b), 10);
      expect(result.a).toBeCloseTo(src.a + dst.a * (1 - src.a), 10);
    });

    test('over-range straight colour is clamped before the blend function runs', () => {
      const src: Sample = { r: 1.6, g: -0.2, b: 0.5, a: 1 };
      const dst: Sample = { r: 0.4, g: 0.7, b: 2.1, a: 1 };
      const result = compositeOverBackdrop(mode, src, dst);
      const clampedRaw = w3cBlend(mode, clampRgb([dst.r, dst.g, dst.b]), clampRgb([src.r, src.g, src.b]));

      expect(result.r).toBeCloseTo(clampedRaw[0], 10);
      expect(result.g).toBeCloseTo(clampedRaw[1], 10);
      expect(result.b).toBeCloseTo(clampedRaw[2], 10);
    });
  });

  describe('Multiply/Screen fractional destination-alpha coverage', () => {
    const cases: ReadonlyArray<{ readonly label: string; readonly src: Sample; readonly dst: Sample }> = [
      { label: 'low backdrop coverage', src: { r: 0.8, g: 0.2, b: 0.6, a: 0.7 }, dst: { r: 0.3, g: 0.9, b: 0.1, a: 0.15 } },
      { label: 'high backdrop coverage', src: { r: 0.5, g: 0.5, b: 0.5, a: 0.4 }, dst: { r: 0.9, g: 0.1, b: 0.4, a: 0.85 } },
      { label: 'equal fractional coverage', src: { r: 0.25, g: 0.75, b: 0.35, a: 0.5 }, dst: { r: 0.6, g: 0.4, b: 0.8, a: 0.5 } },
    ];

    test.each(cases)('$label: Multiply and Screen are only the same operation over an opaque destination', ({ src }) => {
      const opaqueDst: Sample = { ...src, r: 0.6, g: 0.3, b: 0.9, a: 1 };
      const translucentDst: Sample = { ...opaqueDst, a: 0.5 };

      for (const mode of [BlendModes.Multiply, BlendModes.Screen]) {
        const opaqueResult = compositeOverBackdrop(mode, src, opaqueDst);
        const translucentResult = compositeOverBackdrop(mode, src, translucentDst);

        // The compositor's own answer moves with the destination coverage in
        // both modes. Only for one of them does that make the fixed-function
        // shortcut wrong - see the coverage contract in
        // `blend-color-contract.test.ts`, which holds the installed factor
        // pairs against this formula and finds Screen's exact at every alpha.
        expect([opaqueResult.r, opaqueResult.g, opaqueResult.b]).not.toEqual([
          translucentResult.r,
          translucentResult.g,
          translucentResult.b,
        ]);
      }
    });

    test.each(cases)(
      '$label: at full coverage the shortcut is the compositor formula, which is why a provably opaque destination pays nothing',
      ({ src, dst }) => {
        const opaqueDst: Sample = { ...dst, a: 1 };

        for (const mode of [BlendModes.Multiply, BlendModes.Screen]) {
          const composited = compositeOverBackdrop(mode, src, opaqueDst);
          const channels: readonly [number, number, number] = [src.r, src.g, src.b];
          const backdrop: readonly [number, number, number] = [opaqueDst.r, opaqueDst.g, opaqueDst.b];

          // The fixed-function RGB equation of each shortcut mode, written here
          // from the blend state rather than imported, so the two oracles stay
          // independent. Premultiplied inputs, which is what the GPU blends: over
          // full coverage the destination colour IS the premultiplied one.
          const shortcut = (channel: 0 | 1 | 2): number => {
            const cs = channels[channel];
            const cd = backdrop[channel];

            return mode === BlendModes.Multiply ? cs * src.a * cd + cd * (1 - src.a) : cs * src.a + cd * (1 - cs * src.a);
          };

          expect(composited.r).toBeCloseTo(shortcut(0), 10);
          expect(composited.g).toBeCloseTo(shortcut(1), 10);
          expect(composited.b).toBeCloseTo(shortcut(2), 10);
          expect(composited.a, 'source-over alpha at full coverage').toBeCloseTo(1, 10);
        }
      },
    );
  });
});

/**
 * Where a {@link BlendModes.Multiply} draw is actually evaluated, decided by
 * the plan builder from the coverage the destination target can guarantee
 * (`RenderTarget.opaqueDestination`).
 *
 * The oracle above proves the two paths agree exactly when the destination is
 * fully covered and diverge below that; these cases pin the decision that turns
 * that fact into a route, and prove the cheap path survives for a target that
 * can promise coverage. Screen is in none of them: its fixed-function factors
 * are the W3C formula at every destination alpha (`blend-color-contract.test.ts`
 * sweeps the whole coverage space to prove it), so there is no route to take.
 */
describe('backdrop blend routing by destination coverage', () => {
  class BlendBox extends Drawable {
    public constructor(blendMode: BlendModes) {
      super();

      this.setLocalBounds(0, 0, 16, 16);
      this.blendMode = blendMode;
    }
  }

  class NoopFilter extends Filter {
    public override apply(): void {
      // no-op
    }
  }

  const createRuntime = (destination: RenderTarget) => {
    const composited: BlendModes[] = [];
    const drawn: Drawable[] = [];
    const backend: RenderBackend = {
      ...createRenderBackendDouble({ renderTarget: destination }),
      composeWithBackdropBlend(_source, _x, _y, _width, _height, mode) {
        composited.push(mode);

        return this;
      },
      draw(drawable) {
        drawn.push(drawable);

        return this;
      },
    };

    return { backend, composited, drawn };
  };

  /** Build, optimize and play one frame, the way `RenderNode.render()` does. */
  const render = (root: RenderNode, backend: RenderBackend): void => {
    const builder = RenderPlanBuilder.acquire();

    try {
      const plan = builder.build(root, backend);

      RenderPlanOptimizer.optimize(plan);
      RenderPlanPlayer.play(plan, backend);
    } finally {
      RenderPlanBuilder.release(builder);
    }
  };

  const flatten = (scope: GroupScope, into: ScopeEntry[] = []): ScopeEntry[] => {
    for (const entry of scope.entries) {
      into.push(entry);

      if (entry.kind === RenderEntryKind.Group) {
        flatten(entry.scope, into);
      } else if (entry.kind === RenderEntryKind.Barrier && entry.scope.childPlan !== null) {
        flatten(entry.scope.childPlan, into);
      }
    }

    return into;
  };

  /**
   * The nodes a collect resolved through the backdrop compositor, read off the
   * plan's effect descriptors - the same flag the effect executor branches on
   * when it composites a barrier's output.
   */
  const backdropCompositedNodes = (root: RenderNode, backend: RenderBackend): RenderNode[] => {
    const builder = RenderPlanBuilder.acquire();

    try {
      const pass = builder.build(root, backend).passes[0];

      if (pass === undefined) {
        return [];
      }

      return flatten(pass.root)
        .filter(entry => entry.kind === RenderEntryKind.Barrier)
        .map(entry => (entry as { scope: { node: RenderNode; effect: { needsBackdropBlend?: boolean } } }).scope)
        .filter(scope => scope.effect.needsBackdropBlend === true)
        .map(scope => scope.node);
    } finally {
      RenderPlanBuilder.release(builder);
    }
  };

  /** A root canvas that composites without an alpha channel, as both backends report it. */
  const opaqueCanvas = (): RenderTarget => {
    const target = new RenderTarget(64, 64, true);

    target.opaqueDestination = true;

    return target;
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('Multiply over a provably opaque destination keeps the fixed-function path', () => {
    const { backend, composited, drawn } = createRuntime(opaqueCanvas());
    const root = new Container();
    const box = new BlendBox(BlendModes.Multiply);

    root.addChild(box);
    render(root, backend);

    expect(composited, 'backdrop compositor').toEqual([]);
    expect(drawn).toEqual([box]);
  });

  test('Multiply over a destination that cannot promise coverage is composited against the backdrop', () => {
    // An offscreen colour target: every format carries an alpha channel, so the
    // engine cannot prove full coverage however opaque the application clears it.
    const { backend, composited } = createRuntime(new RenderTexture(64, 64));
    const root = new Container();

    root.addChild(new BlendBox(BlendModes.Multiply));
    render(root, backend);

    expect(composited).toEqual([BlendModes.Multiply]);
  });

  test.each([BlendModes.Normal, BlendModes.Additive, BlendModes.Subtract, BlendModes.Screen])(
    '%s never pays for a backdrop capture, whatever the destination',
    mode => {
      // Screen is here on evidence, not convenience: its fixed-function factors
      // reproduce the compositor's formula at every coverage, so a route would
      // cost a capture and change nothing.
      const { backend, composited, drawn } = createRuntime(new RenderTexture(64, 64));
      const root = new Container();
      const box = new BlendBox(mode);

      root.addChild(box);
      render(root, backend);

      expect(composited).toEqual([]);
      expect(drawn).toEqual([box]);
    },
  );

  test.each(ADVANCED_BLEND_MODES.filter(mode => mode >= BlendModes.Darken))(
    '%s is composited against the backdrop over an opaque destination too',
    mode => {
      const { backend, composited } = createRuntime(opaqueCanvas());
      const root = new Container();

      root.addChild(new BlendBox(mode));
      render(root, backend);

      expect(composited).toEqual([mode]);
    },
  );

  test('Multiply inside a barrier is composited against the backdrop even when the canvas is opaque', () => {
    // A barrier renders its content into an intermediate colour target, so the
    // destination of a draw inside it is never the canvas and never provably
    // covered - whatever the canvas itself promises. The filtered container
    // composites back over the opaque canvas with its own (source-over) mode, so
    // only the draw inside it may reach for the backdrop.
    const { backend } = createRuntime(opaqueCanvas());
    const root = new Container();
    const group = new Container();
    const box = new BlendBox(BlendModes.Multiply);

    group.filters = [new NoopFilter()];
    group.addChild(box);
    root.addChild(group);

    expect(backdropCompositedNodes(root, backend)).toEqual([box]);
  });

  test('Multiply below a transform-group boundary leaves the group exactly while its destination needs the compositor', () => {
    const opaque = new RetainedContainer();
    const fractional = new RetainedContainer();
    const onOpaque = new BlendBox(BlendModes.Multiply);
    const onFractional = new BlendBox(BlendModes.Multiply);

    opaque.addChild(onOpaque);
    fractional.addChild(onFractional);

    // The composite a backdrop blend produces is a world-space one, so a child
    // that needs it cannot stay under the group's matrix.
    expect(backdropCompositedNodes(opaque, createRuntime(opaqueCanvas()).backend), 'opaque destination').toEqual([]);
    expect(backdropCompositedNodes(fractional, createRuntime(new RenderTexture(64, 64)).backend), 'fractional destination').toEqual([
      onFractional,
    ]);
  });

  test('the same subtree routes by the destination it is collected into', () => {
    // Nothing on the node changes between the two frames - only the target the
    // render goes to, and with it the coverage it can promise.
    const root = new Container();
    const box = new BlendBox(BlendModes.Multiply);

    root.addChild(box);

    const onCanvas = createRuntime(opaqueCanvas());

    render(root, onCanvas.backend);

    expect(onCanvas.composited, 'opaque canvas').toEqual([]);
    expect(onCanvas.drawn).toEqual([box]);

    const intoTexture = createRuntime(new RenderTexture(64, 64));

    render(root, intoTexture.backend);

    expect(intoTexture.composited, 'offscreen target').toEqual([BlendModes.Multiply]);
  });

  test.each([
    BlendModes.Normal,
    BlendModes.Additive,
    BlendModes.Subtract,
    BlendModes.Multiply,
    BlendModes.Screen,
    BlendModes.Darken,
    BlendModes.Luminosity,
  ])('blendModeNeedsBackdrop(%s) follows the destination guarantee', mode => {
    const isAdvanced = mode >= BlendModes.Darken;

    expect(blendModeNeedsBackdrop(mode, true), 'opaque destination').toBe(isAdvanced);
    expect(blendModeNeedsBackdrop(mode, false), 'fractional destination').toBe(isAdvanced || mode === BlendModes.Multiply);
  });
});
