/**
 * Current scene-serialization format version. Written into every
 * {@link SerializedScene} and checked on deserialize so saved data can outlive
 * the code that produced it (see the migration chain in `migrate`).
 */
export const SERIALIZATION_VERSION = 2;

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
  /** The scene's screen-fixed UI layer ({@link Scene.ui}), if it was materialized. */
  ui?: SerializedNode;
}

/**
 * Top-level serialized form of a {@link Prefab} produced by
 * {@link Prefab.toJSON} and consumed by {@link Prefab.fromJSON}.
 *
 * Carries the same `version` field as {@link SerializedScene} and for the same
 * reason: a prefab is documented as persistable to disk or over the network, so
 * a document has to outlive the code that wrote it.
 */
export interface SerializedPrefab {
  /** Format version this document was written with ({@link SERIALIZATION_VERSION}). */
  version: number;
  /** The captured subtree root. */
  root: SerializedNode;
}

/**
 * Options for {@link Scene.serialize} and {@link Prefab.from}.
 */
export interface SerializeOptions {
  /**
   * Components are not part of the serialized format, so serializing a tree
   * whose nodes carry any throws by default rather than writing a document
   * that silently lacks them. Set this to write the tree's visual data alone:
   * structure, transforms, visuals and asset references, with every component
   * left out. Restoring such a document yields nodes without components.
   */
  readonly omitComponents?: boolean;
}

/**
 * Serialized reference to a loaded asset (e.g. a {@link Texture}).
 *
 * Names the request the asset was loaded with, never the asset data: the
 * logical source the caller wrote - the one an asset variant rule was declared
 * for, not the file one device happened to select - and, when they change which
 * resource the request produces, the identity-relevant options. The contract is
 * that referenced assets are pre-loaded into the target {@link Loader} before
 * {@link Scene.deserialize} runs; the reference then resolves to whatever that
 * loader holds for the same request, including its own variant choice.
 *
 * A reference that needs no options is written as the bare source string,
 * which is also the only form version 1 documents contain.
 */
export type SerializedAssetRef = string | { readonly source: string; readonly options: Readonly<Record<string, unknown>> };
