import type { SceneNode } from '#core/SceneNode';
import type { Loader } from '#resources/Loader';

import type { SerializationRegistry } from './SerializationRegistry';
import { deserializeTree, serializeTree } from './serialize';
import type { SerializedNode } from './types';

/**
 * A reusable, data-driven template captured from a configured scene-graph
 * subtree. Capture once with {@link Prefab.from}; stamp out independent copies
 * with {@link instantiate} as many times as needed — no re-serialization per
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
   * Build a prefab from a previously serialized descriptor — e.g. one produced
   * by {@link toJSON} and persisted to disk or fetched over the network.
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the standard `toJSON` JSON convention
  public static fromJSON(descriptor: SerializedNode): Prefab {
    return new Prefab(descriptor);
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

  /** The underlying JSON descriptor (JSON-serialisable). Treat as read-only. The standard `JSON.stringify(prefab)` hook. */
  // eslint-disable-next-line @typescript-eslint/naming-convention -- `toJSON` is the standard JSON.stringify hook name
  public toJSON(): SerializedNode {
    return this._descriptor;
  }
}
