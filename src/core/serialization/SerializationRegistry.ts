import { Registry } from '#core/Registry';
import type { SceneNode } from '#core/SceneNode';

import type { NodeSerializer } from './NodeSerializer';

/**
 * Any abstract or concrete {@link SceneNode} constructor usable as a
 * serialization key.
 */
export type SceneNodeConstructor<T extends SceneNode = SceneNode> = abstract new (...args: any[]) => T;

/**
 * Resolved registry record pairing a type name with its constructor and
 * serializer.
 * @internal
 */
export interface SerializerEntry {
  readonly typeName: string;
  readonly ctor: SceneNodeConstructor;
  readonly serializer: NodeSerializer;
}

/** Walk one step up the constructor's prototype chain, or stop at the base. */
const walkPrototype = (ctor: SceneNodeConstructor): SceneNodeConstructor | null => {
  const parent = Object.getPrototypeOf(ctor) as unknown;

  return typeof parent === 'function' && parent !== Function.prototype ? (parent as SceneNodeConstructor) : null;
};

/**
 * Bidirectional name ↔ constructor ↔ {@link NodeSerializer} registry backing
 * the scene serializer.
 *
 * Serialize resolves a node to its serializer by walking the constructor's
 * prototype chain (so a subclass without its own registration inherits the
 * nearest registered base serializer - nearest across this registry *and* its
 * fallback, never the nearest one this registry happens to know);
 * deserialize resolves by type name.
 * Core registers the built-in node types; extensions contribute their own via
 * the {@link Extension.serializers} binding.
 *
 * @see registerSerializer for the convenience entry point onto the
 * {@link defaultSerializationRegistry}.
 */
export class SerializationRegistry {
  // Exact-match store: the prototype-chain walk lives in `resolveByNode`, which
  // has to interleave it with the fallback chain rather than exhaust either one
  // first. See that method's doc comment.
  private readonly _byCtor = new Registry<SceneNodeConstructor, SerializerEntry>();
  private readonly _byName = new Map<string, SerializerEntry>();

  /**
   * @param _fallback Optional parent registry consulted when this registry has
   *   no own entry for a lookup. An {@link Application} owns its own registry
   *   chained to the {@link defaultSerializationRegistry}, so app-scoped
   *   extension serializers stay isolated per Application while core and
   *   globally-registered serializers remain shared.
   */
  public constructor(private readonly _fallback: SerializationRegistry | null = null) {}

  /**
   * Register `serializer` for `ctor` under `typeName`. Re-registering the same
   * `(typeName, ctor)` pair overwrites silently; registering an existing
   * `typeName` against a **different** constructor throws.
   */
  public register<T extends SceneNode>(typeName: string, ctor: SceneNodeConstructor<T>, serializer: NodeSerializer<T>): void {
    const existing = this._byName.get(typeName);

    if (existing !== undefined && existing.ctor !== ctor) {
      throw new Error(`A serializer for type name "${typeName}" is already registered for a different constructor.`);
    }

    const entry: SerializerEntry = { typeName, ctor, serializer };

    this._byCtor.set(ctor, entry);
    this._byName.set(typeName, entry);
  }

  /**
   * Resolve the serializer for `node` by walking its constructor's prototype
   * chain. Returns `undefined` if no registration matches.
   *
   * Own and inherited registrations are ranked together by how specific the
   * registered constructor is, one prototype level at a time: the exact
   * constructor first, then its base, and so on, each level checked across the
   * whole fallback chain before moving up. Exhausting this registry's own
   * chain first would let a locally registered base class beat an exact match
   * that only the fallback knows about - an application that registers part of
   * a hierarchy would then silently serialize its subclasses as the base type.
   * Registries closer to this one still win ties at equal specificity.
   * @internal
   */
  public resolveByNode(node: SceneNode): SerializerEntry | undefined {
    let ctor: SceneNodeConstructor | null = node.constructor as SceneNodeConstructor;

    while (ctor !== null) {
      const entry = this._resolveExactCtor(ctor);

      if (entry !== undefined) {
        return entry;
      }

      ctor = walkPrototype(ctor);
    }

    return undefined;
  }

  /** The entry registered for exactly `ctor` - no prototype walk - searching this registry, then its fallback chain. */
  private _resolveExactCtor(ctor: SceneNodeConstructor): SerializerEntry | undefined {
    return this._byCtor.resolve(ctor) ?? this._fallback?._resolveExactCtor(ctor);
  }

  /**
   * Resolve the serializer registered under `typeName`, or `undefined`.
   * @internal
   */
  public resolveByName(typeName: string): SerializerEntry | undefined {
    return this._byName.get(typeName) ?? this._fallback?.resolveByName(typeName);
  }

  /** Returns `true` if a serializer is registered under `typeName`. */
  public hasType(typeName: string): boolean {
    return this._byName.has(typeName) || (this._fallback?.hasType(typeName) ?? false);
  }

  /**
   * Remove every own registration (both the name and constructor maps). The
   * fallback chain is left untouched. Test infrastructure only - used to reset
   * the {@link defaultSerializationRegistry} between suites so process-wide
   * registrations do not leak across them.
   * @internal
   */
  public clear(): void {
    this._byName.clear();
    this._byCtor.destroy();
  }
}

/**
 * Process-wide default registry. Core node serializers register here lazily on
 * first use; extension serializers are materialised here at Application
 * construction.
 */
export const defaultSerializationRegistry = new SerializationRegistry();

/**
 * Register a custom {@link NodeSerializer}. Defaults to the
 * {@link defaultSerializationRegistry}; pass `app.serializers` to register the
 * type only for that {@link Application} (it stays isolated from other apps and
 * from the global registry, resolving through the fallback chain).
 *
 * Use this to make your own {@link SceneNode} subclasses serializable. Delegate
 * to a base type's behaviour by composing with the framework helpers, or
 * register a fully custom serializer.
 *
 * ```ts
 * registerSerializer('PowerUp', PowerUp, {
 *   write: (node) => ({ kind: node.kind }),
 *   read: (data) => new PowerUp(typeof data.kind === 'string' ? data.kind : ''),
 * });
 * ```
 */
export const registerSerializer = <T extends SceneNode>(
  typeName: string,
  ctor: SceneNodeConstructor<T>,
  serializer: NodeSerializer<T>,
  registry: SerializationRegistry = defaultSerializationRegistry,
): void => {
  registry.register(typeName, ctor, serializer);
};
