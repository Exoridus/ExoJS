/**
 * The vocabulary the parity runner walks: scenes describe *what* to render,
 * properties describe *what must hold* about a rendering, and the runner emits
 * one test per applicable combination.
 *
 * A scene knows nothing about backends or assertions, and a property knows
 * nothing about any particular feature. That split is what lets a new feature
 * cost one scene entry, and a new correctness check one property entry that
 * applies to every existing scene at once.
 */

import type { Container } from '#rendering/Container';
import type { RenderBackend } from '#rendering/RenderBackend';

import type { EvidenceClass, SupportState } from './evidenceSink';

export type { EvidenceClass, EvidenceRow, SupportState } from './evidenceSink';

/**
 * How a scene's texture data is built.
 *
 * `self-describing` means every texel encodes its own coordinates, which is the
 * precondition for a `traced` verdict: each output pixel can be checked against
 * the texel it must have come from. Anything else can only be compared frame to
 * frame, sampled, or held against an oracle.
 *
 * `colour-modified` is a self-describing texture the scene then tints, blends
 * or otherwise recolours. The geometry stays exact, but the channels no longer
 * carry coordinates, so the pixel cannot be traced back - worth stating
 * separately from `opaque-solid`, where nothing was traceable to begin with.
 */
export type FixtureKind = 'self-describing' | 'colour-modified' | 'opaque-solid' | 'interpolated';

/** One pixel whose value follows from the scene's own inputs, not from a previous run. */
export interface OracleSample {
  /** Canvas coordinates of the pixel to read. */
  readonly x: number;
  readonly y: number;
  /** Expected RGBA in 0..255, computed on the CPU from the scene's inputs. */
  readonly expect: readonly [number, number, number, number];
  /** What this pixel is, in the scene's own terms - read back on failure. */
  readonly describe: string;
}

/**
 * An independent expectation for a scene, which is what separates correctness
 * from agreement: two backends that compute the same colour wrongly still match
 * each other, and no comparison between them can say so.
 *
 * Only worth declaring where the expected value is genuinely derivable - a
 * blend of two known colours, a colour matrix applied to a known input, a stop
 * interpolated along a gradient. A hardcoded table read off a previous run is a
 * golden image with extra steps and does not belong here.
 */
export interface SceneOracle {
  /** Why these pixels are computable without a renderer. Ends up in the evidence note. */
  readonly reason: string;
  /**
   * Largest per-channel deviation the arithmetic itself permits, in 8-bit
   * steps. Covers quantisation on the way through an 8-bit render target and
   * the rounding of a premultiply, never a disagreement about what to compute.
   */
  readonly tolerance: number;
  readonly samples: () => readonly OracleSample[];
}

export interface Scene {
  /** Stable identifier, `feature/variant` by convention. Used as the matrix key. */
  readonly name: string;
  /** The public feature this scene exercises, as it should appear in the matrix. */
  readonly feature: string;
  /** Edge length of the square canvas this scene expects. */
  readonly size: number;
  readonly fixture: FixtureKind;
  /** Nearest sampling is the other half of the `traced` precondition. */
  readonly nearestSampled: boolean;
  /** Builds a fresh scene graph. Called once per backend - never share nodes across backends. */
  readonly build: () => Container;
  /**
   * Bounds within which this scene's two backends may disagree, for the rare
   * scene whose output cannot be bit-exact across adapters.
   *
   * Declaring this drops the scene out of the bit-exact evidence class, so it
   * needs a reason rooted in the hardware rather than in the engine, stated at
   * the scene. Both bounds hold together: no channel may differ by more than
   * `delta`, and no more than `maxPixelFraction` of the frame may differ at
   * all. The second is what keeps the check meaningful - an engine-side
   * divergence (a threshold, a swizzle, a wrong varying) moves a large,
   * contiguous share of the image, not a sparse rim of it.
   */
  readonly crossBackendTolerance?: {
    readonly delta: number;
    readonly maxPixelFraction: number;
  };
  /**
   * Registers renderers this scene needs beyond the core set, called once on a
   * freshly initialised backend before anything is drawn.
   *
   * Features living in extension packages - tilemaps, particles - have no
   * binding in `wireCoreRenderers`, so without this their nodes would silently
   * draw nothing. Which is precisely the failure `renders-something` was added
   * to catch, and a matrix row claiming verification of an unregistered
   * renderer would be worse than no row at all.
   */
  readonly wireRenderers?: (backend: RenderBackend) => void;
  /**
   * Expected pixel values derived from this scene's own inputs. Declaring one
   * is what lets the scene reach `oracle` evidence; without it the scene can
   * only be compared against another rendering of itself.
   */
  readonly oracle?: SceneOracle;
}

/** What a property observed. `support` and `evidence` are deliberately separate axes. */
export interface PropertyResult {
  readonly support: SupportState;
  /** The strongest class this property could justify. The runner may downgrade it. */
  readonly evidence: EvidenceClass;
  readonly delta: number | null;
  readonly note?: string;
}

/**
 * Whether a property needs one backend or both.
 *
 * `per-backend` properties run once per backend and say something about that
 * backend alone (determinism, oracle agreement). `cross-backend` properties
 * compare the two and produce a single row per backend pair.
 */
export type PropertyScope = 'per-backend' | 'cross-backend';

export interface PropertyContext {
  readonly scene: Scene;
  /** Skips the run when the software adapter drops the device mid-test. */
  readonly skip: (reason: string) => void;
}

export interface PerBackendProperty {
  readonly name: string;
  readonly scope: 'per-backend';
  readonly appliesTo: (scene: Scene) => boolean;
  readonly run: (ctx: PropertyContext, backend: 'webgl2' | 'webgpu') => Promise<PropertyResult>;
}

export interface CrossBackendProperty {
  readonly name: string;
  readonly scope: 'cross-backend';
  readonly appliesTo: (scene: Scene) => boolean;
  readonly run: (ctx: PropertyContext) => Promise<PropertyResult>;
}

export type Property = PerBackendProperty | CrossBackendProperty;

/**
 * Caps a property's claim at what the scene can actually support.
 *
 * `traced` requires a self-describing fixture under nearest sampling - without
 * both, an output pixel cannot be traced back to a specific texel, however
 * exhaustively the frames were compared, so the claim drops to `frame-equal`.
 * A `colour-modified` fixture fails the same test for a different reason: the
 * geometry is still exact, but the channels no longer spell out coordinates.
 * Applying this in the runner rather than trusting each property keeps the
 * class observed instead of asserted.
 */
export const cappedEvidence = (scene: Scene, claimed: EvidenceClass): EvidenceClass => {
  if (claimed !== 'traced') return claimed;

  return scene.fixture === 'self-describing' && scene.nearestSampled ? 'traced' : 'frame-equal';
};
