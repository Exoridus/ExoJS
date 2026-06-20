import type { SceneNode } from '#core/SceneNode';
import type { AssetConstructor } from '#resources/FactoryRegistry';
import type { Loader } from '#resources/Loader';

import type { SerializedNode } from './types';

/**
 * Context handed to {@link NodeSerializer.write}. Carries the framework
 * services a type serializer needs: recursion into children and asset-key
 * resolution. The framework writes the `SceneNode`/`RenderNode`/`Drawable`
 * common fields and the `type` tag itself — a serializer only returns its own
 * type-specific fields.
 */
export interface SerializeContext {
  /** Format version being written ({@link SERIALIZATION_VERSION}). */
  readonly version: number;
  /** The loader used to resolve asset references, or `null` if none is available. */
  readonly loader: Loader | null;
  /**
   * Fully serialize a child node — writes its `type` tag, common fields, and
   * type-specific fields. Use this from container-like serializers to recurse.
   */
  writeNode(node: SceneNode): SerializedNode;
  /**
   * Resolve a loaded asset object to the loader source key it was loaded under,
   * or `null` for runtime-created / unkeyed resources (a one-time warning is
   * emitted in that case).
   */
  keyFor(resource: object | null | undefined): string | null;
}

/**
 * Context handed to {@link NodeSerializer.read}. Mirror of
 * {@link SerializeContext} for the inverse direction: child recursion and
 * asset lookup. The framework applies the common fields after `read` returns,
 * so a serializer only constructs the node and sets its type-specific fields.
 */
export interface DeserializeContext {
  /** Format version of the document being read (after migration). */
  readonly version: number;
  /** The loader used to resolve asset references, or `null` if none is available. */
  readonly loader: Loader | null;
  /** Fully deserialize a child node (inverse of {@link SerializeContext.writeNode}). */
  readNode(data: SerializedNode): SceneNode;
  /**
   * Resolve a serialized asset source key back to a loaded resource of `type`,
   * or `null` if the source is missing/unset or the asset was not pre-loaded
   * (a one-time warning is emitted in the not-loaded case).
   */
  resolveAsset<T>(source: string | null | undefined, type: AssetConstructor<T>): T | null;
}

/**
 * Bidirectional serializer for one scene-graph node type. Registered against a
 * type name + constructor in a {@link SerializationRegistry}. The framework
 * owns the common transform/visual fields and the `type` tag; an implementation
 * handles only the fields unique to its type.
 *
 * @typeParam T - the node type this serializer handles.
 */
export interface NodeSerializer<T extends SceneNode = SceneNode> {
  /**
   * Return the type-specific fields for `node` as a JSON-serialisable record.
   * Do **not** include the `type` tag or common transform/visual fields — the
   * framework adds those. Recurse into children via {@link SerializeContext.writeNode}.
   */
  write(node: T, ctx: SerializeContext): Record<string, unknown>;
  /**
   * Construct a fresh node from `data` and set its type-specific fields. The
   * framework applies the common transform/visual fields afterwards, so do not
   * read them here. Recurse into children via {@link DeserializeContext.readNode}.
   */
  read(data: SerializedNode, ctx: DeserializeContext): T;
}
