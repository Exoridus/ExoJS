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

import type { EvidenceClass, SupportState } from './evidenceSink';

export type { EvidenceClass, EvidenceRow, SupportState } from './evidenceSink';

/**
 * How a scene's texture data is built.
 *
 * `self-describing` means every texel encodes its own coordinates, which is the
 * precondition for a `traced` verdict: each output pixel can be checked against
 * the texel it must have come from. Anything else can only be compared frame to
 * frame, sampled, or held against an oracle.
 */
export type FixtureKind = 'self-describing' | 'opaque-solid' | 'interpolated';

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
  /** Builds a fresh scene graph. Called once per backend — never share nodes across backends. */
  readonly build: () => Container;
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
 * `traced` requires a self-describing fixture under nearest sampling — without
 * both, an output pixel cannot be traced back to a specific texel, however
 * exhaustively the frames were compared, so the claim drops to `frame-equal`.
 * Applying this in the runner rather than trusting each property keeps the
 * class observed instead of asserted.
 */
export const cappedEvidence = (scene: Scene, claimed: EvidenceClass): EvidenceClass => {
  if (claimed !== 'traced') return claimed;

  return scene.fixture === 'self-describing' && scene.nearestSampled ? 'traced' : 'frame-equal';
};
