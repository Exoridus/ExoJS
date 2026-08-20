import type { Loader } from '#assets/Loader';
import type { SceneNode } from '#core/SceneNode';

import type { SerializationRegistry } from './SerializationRegistry';
import { deserializeTree, migratePrefab, serializeTree } from './serialize';
import { SERIALIZATION_VERSION, type SerializedNode, type SerializedPrefab } from './types';

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
  private constructor(private readonly _descriptor: SerializedNode) {}

  /**
   * Capture `node`'s subtree as a prefab. Pass the {@link Loader} so texture and
   * other asset references resolve to their source keys. Pass `app.serializers`
   * as `registry` to resolve app-scoped (extension) serializers; defaults to the
   * global registry.
   */
  public static from(node: SceneNode, loader: Loader | null = null, registry?: SerializationRegistry): Prefab {
    return new Prefab(serializeTree(node, loader, registry));
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
    return new Prefab(migratePrefab(document).root);
  }

  /**
   * Instantiate a fresh, independent copy of the captured subtree. Referenced
   * assets must be pre-loaded into `loader`. Call repeatedly for many instances.
   * Pass `app.serializers` as `registry` to resolve app-scoped (extension)
   * serializers; defaults to the global registry.
   */
  public instantiate(loader: Loader | null = null, registry?: SerializationRegistry): SceneNode {
    return deserializeTree(this._descriptor, loader, registry);
  }

  /**
   * The prefab as a versioned, JSON-serialisable document - the standard
   * `JSON.stringify(prefab)` hook. Treat the returned object as read-only; the
   * `root` is the live internal descriptor, not a copy.
   */
  public toJSON(): SerializedPrefab {
    return { version: SERIALIZATION_VERSION, root: this._descriptor };
  }
}
