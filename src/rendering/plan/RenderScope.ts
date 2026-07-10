import type { Rectangle } from '#math/Rectangle';
import type { Filter } from '#rendering/filters/Filter';
import type { Geometry } from '#rendering/geometry/Geometry';
import type { MaskSource, RenderNode } from '#rendering/RenderNode';
import type { BlendModes } from '#rendering/types';

import type { DrawCommand, RenderEntryKind } from './RenderCommand';

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
  readonly cacheAsBitmap: boolean;
  readonly blendMode: BlendModes;
  /**
   * When `true`, the node uses a backdrop-aware blend mode (modes 5–17). The
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
 * recycle a pooled entry across frames (Slice 2b). `kind` stays `readonly` —
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
  preserveDrawOrder: boolean;
  /**
   * The transform-group boundary node whose world matrix scopes this group's
   * draws (Track B Slice 2), or `null` for a plain scope. Read live by the
   * plan player at playback time — never captured — so a group move between
   * collect and play (or across multi-render() bases) is always honored.
   */
  transformNode: RenderNode | null;
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
}

/** @internal */
export type RenderScope = GroupScope | BarrierScope;
