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
}

/** @internal */
export interface DrawScopeEntry {
  readonly kind: RenderEntryKind.Draw;
  readonly seq: number;
  readonly zIndex: number;
  readonly command: DrawCommand;
}

/** @internal */
export interface GroupScopeEntry {
  readonly kind: RenderEntryKind.Group;
  readonly seq: number;
  readonly zIndex: number;
  readonly scope: GroupScope;
}

/** @internal */
export interface BarrierScopeEntry {
  readonly kind: RenderEntryKind.Barrier;
  readonly seq: number;
  readonly zIndex: number;
  readonly scope: BarrierScope;
}

/** @internal */
export type ScopeEntry = DrawScopeEntry | GroupScopeEntry | BarrierScopeEntry;

/** @internal */
export interface GroupScope {
  readonly kind: RenderEntryKind.Group;
  entries: ScopeEntry[];
  hasMixedZ: boolean;
  preserveDrawOrder: boolean;
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
