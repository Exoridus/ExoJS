import type { AssetConstructor } from '#assets/AssetConstructor';
import type { CatalogResourceLeaf, CatalogValueLeaf } from '#assets/assetMeta';
import type { Loader } from '#assets/Loader';
import type { SceneNode } from '#core/SceneNode';

import type { LocalReference, LocalReferenceReader } from './localReferences';
import type { DeserializeOptions, SerializedAssetRef, SerializedNode } from './types';

/**
 * Context handed to {@link NodeSerializer.write}. Carries the framework
 * services a type serializer needs: recursion into children and asset-key
 * resolution. The framework writes the `SceneNode`/`RenderNode`/`Drawable`
 * common fields and the `type` tag itself - a serializer only returns its own
 * type-specific fields.
 */
export interface SerializeContext {
  /** Format version being written ({@link SERIALIZATION_VERSION}). */
  readonly version: number;
  /** The loader used to resolve asset references, or `null` if none is available. */
  readonly loader: Loader | null;
  /**
   * Fully serialize a child node - writes its `type` tag, common fields, and
   * type-specific fields. Use this from container-like serializers to recurse.
   */
  writeNode(node: SceneNode): SerializedNode;
  /** Writes a reference to a node or component embedded elsewhere in this document. */
  local(value: object): LocalReference;
  /**
   * Resolve a loaded asset object to the reference it was loaded under, or
   * `null` for runtime-created / unkeyed resources (a one-time warning is
   * emitted in that case). Store the result as it is; hand it back to
   * {@link DeserializeContext.resolveAsset} or {@link DeserializeContext.resolve} unchanged.
   *
   * @throws If no single honest reference exists: the asset was reached through
   *   several logical sources, or through options a document cannot carry.
   */
  keyFor(resource: object | null | undefined): SerializedAssetRef | null;
}

/**
 * Context handed to {@link NodeSerializer.read}. Mirror of
 * {@link SerializeContext} for the inverse direction: child recursion and
 * asset lookup. The framework applies the common fields after `read` returns,
 * so a serializer only constructs the node and sets its type-specific fields.
 */
export interface DeserializeContext {
  /** Format version of the validated scene or prefab document. */
  readonly version: number;
  /** The loader used to resolve asset references, or `null` if none is available. */
  readonly loader: Loader | null;
  /** Caller approval for sources the default policy refuses; see {@link DeserializeOptions.allowVideoSource}. */
  readonly allowVideoSource?: ((source: URL) => boolean) | undefined;
  /** Fully deserialize a child node (inverse of {@link SerializeContext.writeNode}). */
  readNode(data: SerializedNode): SceneNode;
  /** Links to a document-local object after all embedded objects are constructed. */
  readonly link: LocalReferenceReader['link'];
  /**
   * Resolve a serialized asset reference back to a loaded resource of `type`,
   * or `null` if the reference is missing, malformed, or names an asset that
   * was not pre-loaded (a one-time warning is emitted in the not-loaded case).
   * The reference may be typed, an untagged source/options record, or a source string.
   */
  resolveAsset<T>(reference: unknown, type: AssetConstructor<T>): T | null;
  /**
   * Resolve a reference to a resource handle or value reference without fetching
   * it. Equal references share a handle within this document read. The reader
   * owns the handle's claim; pass the handle to its loader to load the payload.
   *
   * Returns `null` for a missing reference or loader.
   * @throws If the named type is unknown, incompatible, or has no synchronous handle.
   */
  resolve<T>(reference: unknown, type: AssetConstructor<T>): CatalogResourceLeaf<T> | CatalogValueLeaf<T> | null;
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
   * The framework supplies the `type` tag, common fields, components and local
   * identities. Recurse into children via {@link SerializeContext.writeNode}.
   */
  write(node: T, ctx: SerializeContext): Record<string, unknown>;
  /**
   * Construct a fresh node from `data` and set its type-specific fields. The
   * framework applies the common transform/visual fields afterwards, so do not
   * read them here. Recurse into children via {@link DeserializeContext.readNode}.
   * If construction fails before returning, release the node and resources this
   * method created. The framework releases nodes returned by recursive reads
   * when the surrounding read fails.
   */
  read(data: SerializedNode, ctx: DeserializeContext): T;
}
