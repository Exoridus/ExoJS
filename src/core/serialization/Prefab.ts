import type { Loader } from '#assets/Loader';
import type { SceneNode } from '#core/SceneNode';

import type { SerializationRegistry } from './SerializationRegistry';
import { deserializeTree, migratePrefab, serializeTree } from './serialize';
import { type DeserializeOptions, SERIALIZATION_VERSION, type SerializedNode, type SerializedPrefab, type SerializeOptions } from './types';

/**
 * A reusable, data-driven template captured from a configured scene-graph
 * subtree. Capture once with {@link Prefab.from}; stamp out independent copies
 * with {@link instantiate} as many times as needed - no re-serialization per
 * instance.
 *
 * A prefab holds the same **data, not behaviour** a scene serializer captures
 * (structure, transforms, visuals, asset references). Re-attach behaviour
 * (signal handlers, systems) in code after {@link instantiate}.
 *
 * ```ts
 * const coin = Prefab.from(buildCoin(), loader);
 * for (let i = 0; i < 10; i++) {
 *   const node = coin.instantiate(loader);
 *   node.setPosition(i * 32, 0);
 *   scene.addChild(node);
 * }
 * ```
 */
export class Prefab {
  private constructor(
    private readonly _descriptor: SerializedNode,
    private readonly _version: number = SERIALIZATION_VERSION,
  ) {}

  /**
   * Capture `node`'s subtree as a prefab. Pass the {@link Loader} so texture and
   * other asset references resolve to their source keys. Pass `app.serializers`
   * as `registry` to resolve app-scoped (extension) serializers; defaults to the
   * global registry.
   *
   * @throws If a node in the subtree carries components, unless
   *   {@link SerializeOptions.omitComponents} is set - a prefab never drops
   *   them silently.
   */
  public static from(node: SceneNode, loader: Loader | null = null, registry?: SerializationRegistry, options?: SerializeOptions): Prefab {
    return new Prefab(serializeTree(node, loader, registry, options));
  }

  /**
   * Build a prefab from a previously serialized document - e.g. one produced by
   * {@link toJSON} and persisted to disk or fetched over the network.
   *
   * Like {@link Scene.deserialize} this is an untrusted boundary, so the
   * parameter is `unknown`: the document's `version` frame and root node are
   * validated here. Throws when the document is not an object, carries a version
   * newer than this build supports, or has no valid root.
   */
  public static fromJSON(document: unknown): Prefab {
    const validated = migratePrefab(document);

    return new Prefab(validated.root, validated.version);
  }

  /**
   * Instantiate a fresh, independent copy of the captured subtree. Referenced
   * assets must be pre-loaded into `loader`. Call repeatedly for many instances.
   * Pass `app.serializers` as `registry` to resolve app-scoped (extension)
   * serializers; defaults to the global registry.
   *
   * @throws If the prefab holds a `Video` whose source the default policy
   *   refuses and {@link DeserializeOptions.allowVideoSource} does not approve.
   */
  public instantiate(loader: Loader | null = null, registry?: SerializationRegistry, options?: DeserializeOptions): SceneNode {
    return deserializeTree(this._descriptor, loader, registry, this._version, options);
  }

  /**
   * The prefab as a versioned, JSON-serialisable document - the standard
   * `JSON.stringify(prefab)` hook. A prefab loaded from an older document
   * retains its source version until an explicit migration transforms its data.
   * Treat the result as read-only; `root` is the live descriptor, not a copy.
   */
  public toJSON(): SerializedPrefab {
    return { version: this._version, root: this._descriptor };
  }
}
