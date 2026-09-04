import type { Drawable } from '#rendering/Drawable';
import type { MaterialKey } from '#rendering/material/MaterialKey';
import type { RenderBackend } from '#rendering/RenderBackend';
import { resolveRendererFor } from '#rendering/rendererLookup';

export const enum RenderEntryKind {
  Draw,
  Group,
  Barrier,
}

/**
 * One drawable submission inside a render plan, as the plan player hands it to
 * a backend. A renderer reads the command the backend is currently submitting
 * through `activeDrawCommand` to key per-draw state on it.
 *
 * Commands are pooled and recycled across frames - read what you need during
 * the submission and never retain the object.
 */
export interface DrawCommand {
  readonly kind: RenderEntryKind.Draw;
  /** Mutable so the builder can recycle a pooled command across frames. */
  drawable: Drawable;
  nodeIndex: number;
  seq: number;
  zIndex: number;
  material: MaterialKey;
  /** Assigned by the optimizer; consecutive draws with the same groupIndex
   *  form a batch-safe unit.  `undefined` before optimisation (and reset to
   *  `undefined` when a pooled command is recycled). Required-but-nullable so the
   *  builder can explicitly clear it under `exactOptionalPropertyTypes`. */
  groupIndex: number | undefined;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Whether a draw command's renderer reads the shared {@link TransformBuffer} /
 * transform storage. The render-group upload boundary packs each command's
 * world transform (+ tint) keyed by its `nodeIndex`; only renderers that fetch
 * those rows back from the buffer need a record written.
 *
 * Sprite and Mesh (and their subclasses - {@link AnimatedSprite}, Video,
 * Graphics' meshes) fetch the transform via `nodeIndex` and therefore consume
 * it. Text/BitmapText and particle renderers pack their own per-node data into
 * a private data texture / uniforms and never touch the shared buffer, so they
 * opt out via `_consumesSharedTransform === false` and their writes are skipped.
 *
 * Anything else - a custom renderer, or a drawable with no registered renderer
 * (resolve throws) - defaults to writing, so behaviour is unchanged for any
 * path that might still rely on the shared transform.
 *
 * @internal
 */
interface SharedTransformRenderer {
  readonly _consumesSharedTransform?: boolean;
}

export const drawCommandUsesSharedTransform = (command: DrawCommand, backend: RenderBackend): boolean => {
  // No renderer to ask, or none registered for a custom drawable: keep the
  // conservative write so any consumer of the shared transform keeps working.
  const renderer = resolveRendererFor(backend, command.drawable) as SharedTransformRenderer | null;

  return renderer?._consumesSharedTransform !== false;
};
