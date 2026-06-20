/**
 * Current scene-serialization format version. Written into every
 * {@link SerializedScene} and checked on deserialize so saved data can outlive
 * the code that produced it (see the migration chain in `migrate`).
 */
export const SERIALIZATION_VERSION = 1;

/**
 * Plain-old-JSON description of a single scene-graph node.
 *
 * Always carries a `type` tag (the registered type name) plus an open set of
 * common transform/visual fields and type-specific fields. Every field is
 * JSON-serialisable; runtime-only state (caches, dirty flags, matrices,
 * signals, GPU resources) is never present.
 *
 * Common fields are written by the framework and omitted when they hold their
 * default value, so a freshly-constructed node serialises to `{ type }` alone.
 */
export interface SerializedNode {
  /** Registered type name, e.g. `"Container"`, `"Sprite"`, `"Text"`. */
  type: string;
  /** Optional node identity ({@link SceneNode.name}); omitted when `null`. */
  name?: string;
  /** Type-specific and common fields. */
  [key: string]: unknown;
}

/**
 * Top-level serialized form of a {@link Scene} produced by
 * {@link Scene.serialize} and consumed by {@link Scene.deserialize}.
 */
export interface SerializedScene {
  /** Format version this document was written with ({@link SERIALIZATION_VERSION}). */
  version: number;
  /** The scene's structural root container subtree. */
  root: SerializedNode;
}

/**
 * Serialized reference to a loaded asset (e.g. a {@link Texture}).
 *
 * Stores the loader **source key** the asset was loaded under, not the asset
 * data itself. The contract is that referenced assets are pre-loaded into the
 * target {@link Loader} before {@link Scene.deserialize} runs.
 */
export interface AssetRef {
  /** Loader alias/source the asset was originally loaded under. */
  source: string;
}
