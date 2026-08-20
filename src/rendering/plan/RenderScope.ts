import type { Rectangle } from '#math/Rectangle';
import type { Filter } from '#rendering/filters/Filter';
import type { Geometry } from '#rendering/geometry/Geometry';
import type { MaskSource, RenderNode } from '#rendering/RenderNode';
import type { BlendModes } from '#rendering/types';

import type { PersistentSlotDrawRecord } from './PersistentSlotDraw';
import type { DrawCommand, RenderEntryKind } from './RenderCommand';
import type { RetainedInstructionSet } from './RetainedInstructionSet';

/**
 * Geometric clip kind for a {@link RenderNode}'s `clip`/`clipShape`. Distinct
 * from `maskSource` (alpha/visibility masking): `Rect` uses the GPU scissor
 * fast path, `Stencil` writes a {@link Geometry} silhouette into the stencil
 * buffer. `maskSource` continues to drive the separate alpha-mask machinery.
 * @internal
 */
export const enum ClipKind {
  None,
  Rect,
  Stencil,
}

/** @internal */
export interface EffectDescriptor {
  readonly filters: readonly Filter[];
  readonly clip: ClipKind;
  readonly clipShape: Rectangle | Geometry | null;
  readonly maskSource: MaskSource;
  readonly cacheAsTexture: boolean;
  readonly blendMode: BlendModes;
  /**
   * When `true`, the node uses a backdrop-aware blend mode (modes 5-17). The
   * render-effect executor renders the content off-screen and composites it back
   * via {@link RenderBackend.composeWithBackdropBlend} instead of the regular
   * draw-texture path.
   */
  readonly needsBackdropBlend?: boolean;
}

/**
 * @internal
 *
 * `seq`/`zIndex`/`command` are mutable so the {@link RenderPlanBuilder} can
 * recycle a pooled entry across frames. `kind` stays `readonly` -
 * a pooled entry never changes its discriminant.
 */
export interface DrawScopeEntry {
  readonly kind: RenderEntryKind.Draw;
  seq: number;
  zIndex: number;
  command: DrawCommand;
}

/** @internal */
export interface GroupScopeEntry {
  readonly kind: RenderEntryKind.Group;
  seq: number;
  zIndex: number;
  scope: GroupScope;
}

/** @internal */
export interface BarrierScopeEntry {
  readonly kind: RenderEntryKind.Barrier;
  seq: number;
  zIndex: number;
  scope: BarrierScope;
}

/** @internal */
export type ScopeEntry = DrawScopeEntry | GroupScopeEntry | BarrierScopeEntry;

/** @internal */
export interface GroupScope {
  readonly kind: RenderEntryKind.Group;
  entries: ScopeEntry[];
  hasMixedZ: boolean;
  /**
   * `true` once this scope has seen two draws that would force the batcher to
   * flush between them on material grounds - see `forcesBatchFlush`. Maintained
   * incrementally while the plan is collected, exactly like
   * {@link GroupScope.hasMixedZ}, and read by {@link RenderPlanOptimizer} to skip
   * the material-grouping pass outright: when no draw pairing in the scope costs
   * a flush, reordering provably saves no draw call, so the per-draw bookkeeping
   * the pass would allocate is pure waste.
   *
   * Deliberately NOT "the material keys differ": a plain sprite scope over two
   * atlases differs in `bindKey` on every second draw and still batches into one
   * draw call, because the 16 texture slots absorb the change.
   */
  hasMixedPipeline: boolean;
  preserveDrawOrder: boolean;
  /**
   * The transform-group boundary node whose world matrix scopes this group's
   * draws, or `null` for a plain scope. Read live by the
   * plan player at playback time - never captured - so a group move between
   * collect and play (or across multi-render() bases) is always honored.
   */
  transformNode: RenderNode | null;
  /**
   * Valid instruction set spliced into this scope: the scope's entries are
   * EMPTY and the plan player replays the recorded batches instead of
   * walking entries. `null` on every other scope.
   */
  retainedInstructions: RetainedInstructionSet | null;
  /**
   * One render root's persistent-indexed draw spliced into this scope: the
   * entries are EMPTY and the player asks the backend to draw the order stream
   * instead of walking them. `null` on every other scope.
   */
  persistentDraw: PersistentSlotDrawRecord | null;
  /**
   * Armed record target: the plan player records this scope's
   * playback (flush-level batches + nested-group markers) into the set.
   * `null` unless the collect switch armed recording for this frame.
   */
  retainedRecordTarget: RetainedInstructionSet | null;
}

/** @internal */
export interface BarrierScope {
  readonly kind: RenderEntryKind.Barrier;
  readonly node: RenderNode;
  readonly effect: EffectDescriptor;
  childPlan: GroupScope | null;
  left: number;
  top: number;
  width: number;
  height: number;
  /**
   * Device pixels per logical unit the barrier's internal targets are allocated
   * at. `left`/`top`/`width`/`height` stay LOGICAL - the capture view and the
   * composite both work in logical units, and only the texture extent is scaled
   * by this. Resolved once per barrier by the plan builder (see
   * `targetResolution.ts`).
   */
  resolution: number;
}

/** @internal */
export type RenderScope = GroupScope | BarrierScope;
